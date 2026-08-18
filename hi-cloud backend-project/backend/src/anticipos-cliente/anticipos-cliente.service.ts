import {
  Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { fechaHoyRD, mesHoyRD } from '../common/utils/fecha-local.util';
import { AnticipoCliente, EstadoAnticipo } from './entities/anticipo-cliente.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { PagoCobrado } from '../cxc/entities/pago-cobrado.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { MetodoPago } from '../common/enums/metodo-pago.enum';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';

export interface CreateAnticipoDto {
  clienteId?:     number;
  clienteNombre?: string;
  monto:          number;
  tipoPago?:      string;
  referencia?:    string;
  descripcion?:   string;
  nombreUsuario?: string;
  concepto?:      string; // alias usado por el POS
  metodoPago?:    string; // alias usado por el POS
  fecha?:         string; // ignorado — el backend usa fechaHoyRD()
  vendedorId?:    number; // enviado por el POS, ignorado en anticipos
}

export interface AplicarAnticipoDto {
  cxcId:   number;
  monto?:  number;
}

@Injectable()
export class AnticiposClienteService implements OnModuleInit {
  private readonly logger = new Logger(AnticiposClienteService.name);

  constructor(
    @InjectRepository(AnticipoCliente)
    private repo: Repository<AnticipoCliente>,
    @InjectRepository(CuentaPorCobrar)
    private cxcRepo: Repository<CuentaPorCobrar>,
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    @InjectDataSource()
    private ds: DataSource,
    private asientosService: AsientosAutomaticosService,
    private tenantSvc: TenantService,
  ) {}

  // ── Garantizar que exista la cuenta "Anticipos de Clientes" en todas las empresas ──
  async onModuleInit() {
    try {
      // Tabla: cuentas_contables  Columnas: codigo, nombre, tipo (enum), naturaleza (enum),
      //        nivel, permiteMovimientos, empresaId, isActive, createdAt, updatedAt
      await this.ds.query(`
        INSERT INTO cuentas_contables (
          codigo, nombre, tipo, naturaleza, nivel, "permiteMovimientos",
          "empresaId", "isActive", "createdAt", "updatedAt"
        )
        SELECT
          '2.1.5.01', 'Anticipos de Clientes', 'pasivo', 'acreedora', 3, true,
          e.id, true, NOW(), NOW()
        FROM empresa e
        WHERE e."isActive" = true
          AND NOT EXISTS (
            SELECT 1 FROM cuentas_contables cc
            WHERE cc.codigo = '2.1.5.01' AND cc."empresaId" = e.id
          )
        ON CONFLICT DO NOTHING
      `);
      this.logger.log('Cuenta Anticipos de Clientes (2.1.5.01) verificada');
    } catch (e) {
      this.logger.warn('onModuleInit anticipos (ignorado): ' + e);
    }
  }

  // ── Número correlativo ──────────────────────────────────────────────────────
  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'anticipo_cliente', 'numero', '^ANT-[0-9]+$', 'ANT-', 1, empresaId,
    );
  }

  // ── Crear anticipo ──────────────────────────────────────────────────────────
  async crear(dto: CreateAnticipoDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Normalizar aliases del POS (metodoPago → tipoPago, concepto → descripcion)
    const tipoPago    = dto.tipoPago ?? dto.metodoPago ?? 'efectivo';
    const descripcion = dto.descripcion ?? dto.concepto ?? 'Anticipo de cliente';
    const monto       = Number(dto.monto);

    if (monto <= 0) throw new BadRequestException('El monto debe ser mayor a 0');

    // Encontrar caja diaria activa para este empresa (hoy).
    // Si no hay caja abierta el anticipo se guarda igual pero sin cajaDiariaId,
    // lo que significa que NO aparecerá en el arqueo del cajero.
    // En ese caso se devuelve un aviso para que el frontend lo informe al cajero.
    // Si el control de caja está desactivado para esta empresa, no se busca ni avisa.
    const [empRow] = await this.ds.query<{ controlCajaActivo: boolean }[]>(
      `SELECT "controlCajaActivo" FROM empresa WHERE id = $1 LIMIT 1`,
      [empresaId],
    );
    const controlActivo = empRow?.controlCajaActivo === true;

    const hoy    = new Date().toISOString().split('T')[0];
    let caja: { id: number } | undefined;
    if (controlActivo) {
      [caja] = await this.ds.query<{ id: number }[]>(`
        SELECT id FROM cierres_caja
        WHERE "empresaId" = $1 AND DATE(fecha) = $2 AND estado = 'abierta'
        ORDER BY id DESC LIMIT 1
      `, [empresaId, hoy]);
    }
    const sinCaja = controlActivo && !caja;
    if (sinCaja) {
      this.logger.warn(
        `[anticipos] Anticipo registrado SIN caja abierta hoy — ` +
        `empresaId=${empresaId}, monto=${monto}. El arqueo del cajero no incluirá este anticipo.`,
      );
    }

    const numero = await this.generarNumero();

    const anticipo = await this.repo.save(
      this.repo.create({
        numero,
        clienteId:    dto.clienteId,
        clienteNombre: dto.clienteNombre,
        monto,
        montoPendiente: monto,
        tipoPago:     tipoPago.normalize('NFD').replace(/[̀-ͯ]/g, ''), // quita acentos
        referencia:   dto.referencia,
        descripcion,
        estado:       EstadoAnticipo.ACTIVO,
        fechaRegistro: hoy,
        cajaDiariaId: caja?.id,
        usuarioId,
        nombreUsuario: dto.nombreUsuario,
        empresaId,
      }),
    );

    // Asiento: DÉBITO Caja/Banco, CRÉDITO Anticipos de Clientes
    const asientoId = await this.asientosService.asientoAnticipo(
      monto, anticipo.id, tipoPago, usuarioId,
    ).catch(err => { this.logger.error(`Asiento anticipo ${anticipo.numero}: ${err.message}`); return null; });

    if (asientoId) await this.repo.update(anticipo.id, { asientoId });

    const saved = await this.repo.findOneByOrFail({ id: anticipo.id });
    // Adjuntar aviso si no hay caja abierta hoy (el anticipo se guardó igual pero
    // sin cajaDiariaId y no aparecerá en el arqueo del cajero).
    return sinCaja
      ? { ...saved, _avisoCaja: 'Este anticipo se registró sin caja abierta hoy y no aparecerá en el arqueo del cajero.' }
      : saved;
  }

  // ── Aplicar anticipo a una CxC ─────────────────────────────────────────────
  async aplicar(anticipoId: number, dto: AplicarAnticipoDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    const anticipo = await this.repo.findOne({ where: { id: anticipoId, empresaId, isActive: true } });
    if (!anticipo) throw new NotFoundException(`Anticipo #${anticipoId} no encontrado`);
    if (anticipo.estado === EstadoAnticipo.ANULADO)  throw new BadRequestException('El anticipo está anulado');
    if (anticipo.estado === EstadoAnticipo.APLICADO) throw new BadRequestException('El anticipo ya fue aplicado completamente');

    const pendiente = Number(anticipo.montoPendiente);
    if (pendiente <= 0) throw new BadRequestException('El anticipo no tiene saldo disponible');

    const cxc = await this.cxcRepo.findOne({ where: { id: dto.cxcId, empresaId, isActive: true } });
    if (!cxc) throw new NotFoundException(`CxC #${dto.cxcId} no encontrada`);
    if ([EstadoCuenta.PAGADA, EstadoCuenta.ANULADA].includes(cxc.estado as EstadoCuenta)) {
      throw new BadRequestException(`La CxC está "${cxc.estado}" y no acepta pagos`);
    }

    const cxcPendiente  = Number(cxc.montoPendiente);
    const montoAplicar  = +(Math.min(dto.monto ?? pendiente, pendiente, cxcPendiente)).toFixed(2);
    if (montoAplicar <= 0) throw new BadRequestException('No hay saldo para aplicar');

    await this.ds.transaction(async (em) => {
      // Actualizar CxC
      const nuevoPagado    = +(Number(cxc.montoPagado)   + montoAplicar).toFixed(2);
      const nuevoPendiente = +(Number(cxc.montoOriginal)  - nuevoPagado).toFixed(2);
      const nuevoEstadoCxc = nuevoPendiente <= 0 ? EstadoCuenta.PAGADA : EstadoCuenta.PAGADA_PARCIAL;

      await em.getRepository(CuentaPorCobrar).update(dto.cxcId, {
        montoPagado:    nuevoPagado,
        montoPendiente: nuevoPendiente,
        estado:         nuevoEstadoCxc as any,
      });

      if (nuevoEstadoCxc === EstadoCuenta.PAGADA && cxc.facturaId) {
        await em.getRepository(Factura).update(cxc.facturaId, { estado: FacturaEstado.PAGADA });
      }

      // Registrar pago en historial de la CxC
      const metodoPagoValido = Object.values(MetodoPago).includes(anticipo.tipoPago as MetodoPago)
        ? (anticipo.tipoPago as MetodoPago)
        : MetodoPago.OTRO;
      await em.getRepository(PagoCobrado).save(
        em.getRepository(PagoCobrado).create({
          cuentaPorCobrarId: dto.cxcId,
          monto:             montoAplicar,
          fecha:             new Date(),
          metodoPago:        metodoPagoValido,
          referencia:        `Anticipo ${anticipo.numero}`,
          moneda:            cxc.moneda ?? 'DOP',
          tipoCambio:        1,
          userId:            usuarioId,
        }),
      );

      // Actualizar anticipo
      const nuevoPendienteAnt = +(pendiente - montoAplicar).toFixed(2);
      await em.getRepository(AnticipoCliente).update(anticipoId, {
        montoPendiente: nuevoPendienteAnt,
        estado: nuevoPendienteAnt <= 0 ? EstadoAnticipo.APLICADO : EstadoAnticipo.ACTIVO,
      });
    });

    // Asiento: DÉBITO Anticipos de Clientes, CRÉDITO Clientes
    await this.asientosService.asientoAplicarAnticipo(montoAplicar, anticipoId, dto.cxcId, usuarioId)
      .catch(err => this.logger.error(`Asiento aplicar anticipo #${anticipoId}: ${err.message}`));

    return {
      ok:            true,
      montoAplicado: montoAplicar,
      anticipo:      await this.repo.findOneByOrFail({ id: anticipoId }),
      cxc:           await this.cxcRepo.findOneByOrFail({ id: dto.cxcId }),
    };
  }

  // ── Anular anticipo ─────────────────────────────────────────────────────────
  async anular(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const anticipo  = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!anticipo) throw new NotFoundException(`Anticipo #${id} no encontrado`);
    if (anticipo.estado === EstadoAnticipo.APLICADO) {
      throw new BadRequestException('No se puede anular un anticipo ya aplicado por completo');
    }
    await this.repo.update(id, { estado: EstadoAnticipo.ANULADO, isActive: false });
    return { ok: true, mensaje: `Anticipo ${anticipo.numero} anulado` };
  }

  // ── Listado ─────────────────────────────────────────────────────────────────
  async listar(pagination: PaginationDto, clienteId?: number, estado?: EstadoAnticipo) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 20, page = 1 } = pagination;
    const where: any = { empresaId, isActive: true };
    if (clienteId) where.clienteId = clienteId;
    if (estado)    where.estado    = estado;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fechaRegistro: 'DESC', createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  Math.min(limit, 100),
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Anticipos activos de un cliente (para consultar al facturar) ────────────
  async getActivosPorCliente(clienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.repo.find({
      where: { empresaId, clienteId, estado: EstadoAnticipo.ACTIVO, isActive: true },
      order: { fechaRegistro: 'ASC' },
    });
  }

  // ── Resumen ─────────────────────────────────────────────────────────────────
  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = fechaHoyRD();
    const mes = mesHoyRD();

    const [hoyR, activos, totalR] = await Promise.all([
      this.repo.createQueryBuilder('a')
        .select('COALESCE(SUM(a.monto),0)', 'total').addSelect('COUNT(a.id)', 'cantidad')
        .where('a.empresaId = :eid AND a.isActive = true AND a."fechaRegistro" = :hoy', { eid: empresaId, hoy })
        .getRawOne<{ total: string; cantidad: string }>(),
      this.repo.createQueryBuilder('a')
        .select('COALESCE(SUM(a."montoPendiente"),0)', 'total').addSelect('COUNT(a.id)', 'cantidad')
        .where('a.empresaId = :eid AND a.isActive = true AND a.estado = :e', { eid: empresaId, e: EstadoAnticipo.ACTIVO })
        .getRawOne<{ total: string; cantidad: string }>(),
      this.repo.createQueryBuilder('a')
        .select('COALESCE(SUM(a.monto),0)', 'total').addSelect('COUNT(a.id)', 'cantidad')
        .where('a.empresaId = :eid AND a.isActive = true', { eid: empresaId })
        .getRawOne<{ total: string; cantidad: string }>(),
    ]);

    return {
      hoy:      { total: +Number(hoyR?.total    ?? 0).toFixed(2), cantidad: Number(hoyR?.cantidad    ?? 0) },
      activos:  { total: +Number(activos?.total  ?? 0).toFixed(2), cantidad: Number(activos?.cantidad  ?? 0) },
      total:    { total: +Number(totalR?.total   ?? 0).toFixed(2), cantidad: Number(totalR?.cantidad   ?? 0) },
    };
  }
}
