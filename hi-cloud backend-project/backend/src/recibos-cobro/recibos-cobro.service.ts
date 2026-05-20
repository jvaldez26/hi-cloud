import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReciboCobro, MetodoPagoRecibo } from './entities/recibo-cobro.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { AnticipoCliente, EstadoAnticipo } from '../anticipos-cliente/entities/anticipo-cliente.entity';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';

interface CreateReciboDto {
  clienteId?:          number;
  clienteNombre?:      string;
  fecha?:              string;
  monto:               number;
  metodoPago:          MetodoPagoRecibo;
  concepto:            string;
  facturaId?:          number;
  facturaFolio?:       string;
  cxcId?:              number;
  referencia?:         string;
  notas?:              string;
  nombreUsuario?:      string;
  registrarExcedente?: boolean; // true → crea anticipo con el excedente sobre la CxC
}

@Injectable()
export class RecibosCobrosService {
  private readonly logger = new Logger(RecibosCobrosService.name);

  constructor(
    @InjectRepository(ReciboCobro)
    private repo: Repository<ReciboCobro>,
    @InjectRepository(CuentaPorCobrar)
    private cxcRepo: Repository<CuentaPorCobrar>,
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    @InjectRepository(AnticipoCliente)
    private anticipoRepo: Repository<AnticipoCliente>,
    @InjectDataSource()
    private dataSource: DataSource,
    private asientosService: AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private tenantSvc: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const res = await this.repo
      .createQueryBuilder('r')
      .select(`MAX(CASE WHEN r.numero ~ '^REC-[0-9]+$'
                        THEN CAST(SUBSTRING(r.numero FROM 5) AS INTEGER)
                        ELSE 100 END)`, 'maxNum')
      .where('r.empresaId = :eid', { eid: empresaId })
      .andWhere('r.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    return `REC-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  async crear(dto: CreateReciboDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const monto     = Number(dto.monto);

    // ── 1. Resolver CxC asociada ────────────────────────────────────
    let cxc: CuentaPorCobrar | null = null;

    if (dto.cxcId) {
      cxc = await this.cxcRepo.findOne({ where: { id: dto.cxcId, empresaId, isActive: true } });
      if (!cxc) throw new NotFoundException(`CxC #${dto.cxcId} no encontrada`);
    } else if (dto.facturaId) {
      cxc = await this.cxcRepo.findOne({
        where: { facturaId: dto.facturaId, empresaId, isActive: true },
      });
      // Si la factura no tiene CxC aún, no es un error — se trata como anticipo
    }

    // ── 2. Validar CxC ──────────────────────────────────────────────
    if (cxc) {
      if (dto.clienteId && cxc.clienteId !== dto.clienteId) {
        throw new BadRequestException('La factura de referencia no pertenece al cliente seleccionado');
      }
      if ([EstadoCuenta.PAGADA, EstadoCuenta.ANULADA].includes(cxc.estado as EstadoCuenta)) {
        throw new BadRequestException(`La cuenta por cobrar está "${cxc.estado}" y no acepta más pagos`);
      }
      const pendiente = Number(cxc.montoPendiente);
      if (monto > pendiente + 0.01 && !dto.registrarExcedente) {
        // El frontend debe preguntar al usuario y reenviar con registrarExcedente=true
        throw new BadRequestException(
          `EXCEDENTE:${(monto - pendiente).toFixed(2)}:${pendiente.toFixed(2)}`,
        );
      }
    }

    // ── 3. Guardar recibo ───────────────────────────────────────────
    const numero = await this.generarNumero();
    const recibo = await this.repo.save(
      this.repo.create({
        ...dto,
        empresaId,
        numero,
        usuarioId,
        cxcId: cxc?.id ?? dto.cxcId,
      }),
    );

    // ── 4. Actualizar CxC y Factura (transacción atómica) ──────────
    if (cxc) {
      const pendiente      = Number(cxc.montoPendiente);
      const excedente      = monto - pendiente;
      const montoParaCxc   = excedente > 0.01 ? pendiente : monto; // si hay excedente, aplicar solo el pendiente
      const nuevoPagado    = Number((Number(cxc.montoPagado) + montoParaCxc).toFixed(2));
      const nuevoPendiente = Number((Number(cxc.montoOriginal) - nuevoPagado).toFixed(2));
      const nuevoEstado    = nuevoPendiente <= 0 ? EstadoCuenta.PAGADA : EstadoCuenta.PAGADA_PARCIAL;

      await this.dataSource.transaction(async (em) => {
        await em.getRepository(CuentaPorCobrar).update(cxc!.id, {
          montoPagado:    nuevoPagado,
          montoPendiente: nuevoPendiente,
          estado:         nuevoEstado as any,
        });

        if (nuevoEstado === EstadoCuenta.PAGADA && cxc!.facturaId) {
          await em.getRepository(Factura).update(cxc!.facturaId, {
            estado: FacturaEstado.PAGADA,
          });
          this.logger.log(
            `Factura #${cxc!.facturaId} marcada como PAGADA — Recibo ${recibo.numero}`,
          );
        }
      });

      // Asiento contable: DÉBITO Bancos, CRÉDITO Clientes (solo por el monto aplicado a CxC)
      await this.asientosService.asientoCobro(montoParaCxc, cxc.id, usuarioId).catch(err =>
        this.logger.error(`Error asiento cobro ${recibo.numero}: ${err.message}`),
      );

      // Tesorería: movimiento de entrada (monto total recibido)
      await this.tesoreriaService.registrarMovimientoAutomatico(
        TipoMovimientoBancario.DEPOSITO,
        monto,
        `Recibo ${recibo.numero} — ${dto.clienteNombre ?? dto.concepto}`,
        OrigenMovimiento.COBRO_CXC,
        cxc.id,
        usuarioId,
      ).catch(err =>
        this.logger.error(`Error tesorería ${recibo.numero}: ${err.message}`),
      );

      // ── Excedente → crear anticipo automáticamente ─────────────
      if (excedente > 0.01 && dto.registrarExcedente) {
        try {
          const hoy = new Date().toISOString().split('T')[0];
          const [cajaRow] = await this.dataSource.query<{ id: number }[]>(
            `SELECT id FROM cierres_caja WHERE "empresaId" = $1 AND DATE(fecha) = $2 AND estado = 'abierta' ORDER BY id DESC LIMIT 1`,
            [empresaId, hoy],
          ).catch(() => []);
          const antNumRes = await this.anticipoRepo
            .createQueryBuilder('a')
            .select(`MAX(CASE WHEN a.numero ~ '^ANT-[0-9]+$' THEN CAST(SUBSTRING(a.numero FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
            .where('a.empresaId = :eid', { eid: empresaId })
            .getRawOne<{ maxNum: number | null }>();
          const antNumero = `ANT-${Math.max(101, (antNumRes?.maxNum ?? 100) + 1)}`;

          const anticipo = await this.anticipoRepo.save(
            this.anticipoRepo.create({
              numero:        antNumero,
              clienteId:     cxc.clienteId,
              clienteNombre: dto.clienteNombre,
              monto:         excedente,
              montoPendiente: excedente,
              tipoPago:      dto.metodoPago,
              descripcion:   `Excedente de Recibo ${recibo.numero}`,
              estado:        EstadoAnticipo.ACTIVO,
              fechaRegistro: hoy,
              cajaDiariaId:  cajaRow?.id,
              usuarioId,
              nombreUsuario: dto.nombreUsuario,
              empresaId,
            }),
          );

          // Asiento excedente: DÉBITO Caja/Banco, CRÉDITO Anticipos de Clientes
          await this.asientosService.asientoAnticipo(excedente, anticipo.id, dto.metodoPago, usuarioId)
            .then(async (asientoId) => { if (asientoId) await this.anticipoRepo.update(anticipo.id, { asientoId }); })
            .catch(err => this.logger.error(`Asiento anticipo excedente ${anticipo.numero}: ${err.message}`));

          this.logger.log(`Anticipo ${anticipo.numero} creado por excedente de recibo ${recibo.numero}`);
          return { recibo, anticipo };
        } catch (err: any) {
          this.logger.error(`Error creando anticipo por excedente: ${err.message}`);
        }
      }
    } else {
      // Sin CxC — anticipo o cobro genérico
      // Asiento: DÉBITO Caja/Bancos, CRÉDITO Clientes
      await this.asientosService.asientoRecibo(
        monto, recibo.id, dto.metodoPago, usuarioId,
      ).catch(err =>
        this.logger.error(`Error asiento recibo ${recibo.numero}: ${err.message}`),
      );

      await this.tesoreriaService.registrarMovimientoAutomatico(
        TipoMovimientoBancario.DEPOSITO,
        monto,
        `Recibo ${recibo.numero} — ${dto.concepto}`,
        OrigenMovimiento.COBRO_CXC,
        recibo.id,
        usuarioId,
      ).catch(err =>
        this.logger.error(`Error tesorería ${recibo.numero}: ${err.message}`),
      );
    }

    return recibo;
  }

  async listar(pagination: PaginationDto, clienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;
    const where: any = { empresaId, isActive: true };
    if (clienteId) where.clienteId = clienteId;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fecha: 'DESC', createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  Math.min(limit, 100),
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const r = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!r) throw new NotFoundException(`Recibo #${id} no encontrado`);
    return r;
  }

  async eliminar(id: number) {
    const recibo     = await this.findOne(id);
    const empresaId  = this.tenantSvc.getEmpresaId();
    const monto      = Number(recibo.monto);

    // ── 1. Revertir CxC si el recibo estaba vinculado a una factura ──
    if (recibo.cxcId) {
      const cxc = await this.cxcRepo.findOne({ where: { id: recibo.cxcId, empresaId, isActive: true } });
      if (cxc) {
        const nuevoMontoPagado    = Math.max(0, +(Number(cxc.montoPagado) - monto).toFixed(2));
        const nuevoMontoPendiente = +(Number(cxc.montoOriginal) - nuevoMontoPagado).toFixed(2);
        const nuevoEstado =
          nuevoMontoPagado <= 0          ? EstadoCuenta.PENDIENTE :
          nuevoMontoPendiente > 0        ? EstadoCuenta.PAGADA_PARCIAL :
                                           EstadoCuenta.PAGADA;

        await this.dataSource.transaction(async (em) => {
          await em.getRepository(CuentaPorCobrar).update(cxc.id, {
            montoPagado:    nuevoMontoPagado,
            montoPendiente: nuevoMontoPendiente,
            estado:         nuevoEstado as any,
          });
          // Revertir estado de factura si había quedado PAGADA por este recibo
          if (cxc.facturaId && nuevoEstado !== EstadoCuenta.PAGADA) {
            await em.getRepository(Factura).update(cxc.facturaId, {
              estado: FacturaEstado.EMITIDA,
            });
          }
        });

        // Asiento de reversión: CRÉDITO Bancos, DÉBITO Clientes (inverso del cobro)
        await this.asientosService.asientoReversion(
          monto, recibo.cxcId, recibo.id, 'recibo', recibo.usuarioId,
        ).catch(err => this.logger.error(`Error asiento reversión ${recibo.numero}: ${err.message}`));
      }
    }

    // ── 2. Anular el recibo ───────────────────────────────────────────
    await this.repo.update(id, { isActive: false });
    return { ok: true, mensaje: `Recibo ${recibo.numero} anulado y CxC revertida` };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = new Date().toISOString().split('T')[0];
    const mes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [hoyR, mesR, totalR] = await Promise.all([
      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .addSelect('COUNT(r.id)', 'cantidad')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .andWhere('r.fecha = :hoy', { hoy })
        .getRawOne<{ total: string; cantidad: string }>(),

      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .andWhere("TO_CHAR(r.fecha::date, 'YYYY-MM') = :mes", { mes })
        .getRawOne<{ total: string }>(),

      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .addSelect('COUNT(r.id)', 'cantidad')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .getRawOne<{ total: string; cantidad: string }>(),
    ]);

    return {
      hoy:   { total: +Number(hoyR?.total   ?? 0).toFixed(2), cantidad: Number(hoyR?.cantidad  ?? 0) },
      mes:   { total: +Number(mesR?.total   ?? 0).toFixed(2) },
      total: { total: +Number(totalR?.total ?? 0).toFixed(2), cantidad: Number(totalR?.cantidad ?? 0) },
    };
  }
}
