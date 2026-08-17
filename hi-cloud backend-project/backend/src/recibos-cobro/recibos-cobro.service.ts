import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { fechaHoyRD, mesHoyRD } from '../common/utils/fecha-local.util';
import { ReciboCobro, MetodoPagoRecibo } from './entities/recibo-cobro.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { PagoCobrado } from '../cxc/entities/pago-cobrado.entity';
import { MetodoPago } from '../common/enums/metodo-pago.enum';
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
  moneda?:             string; // heredada de la factura; default 'DOP'
  // vendedorId del POS (para asociar al cierre de caja correcto)
  vendedorId?:         number;
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
    @InjectRepository(PagoCobrado)
    private pagoRepo: Repository<PagoCobrado>,
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
    return generarNumeroSecuencial(
      this.dataSource, 'recibos_cobro', 'numero', '^REC-[0-9]+$', 'REC-', 1, empresaId,
    );
  }

  /** Encuentra la caja diaria abierta para este recibo.
   *  Prioridad: vendedorId del POS → perfil vendedor del usuario → cualquier caja abierta del usuario */
  private async resolverCajaDiaria(
    empresaId: number,
    usuarioId: number,
    vendedorId?: number,
  ): Promise<number | null> {
    const hoy = fechaHoyRD();

    // 1. Si el POS envió vendedorId → caja de ese vendedor
    if (vendedorId) {
      const rows = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM cierres_caja
         WHERE "empresaId" = $1 AND DATE(fecha) = $2
           AND estado = 'abierta' AND "vendedorId" = $3 LIMIT 1`,
        [empresaId, hoy, vendedorId],
      );
      if (rows[0]?.id) return rows[0].id;
    }

    // 2. Buscar perfil vendedor del usuario autenticado y su caja
    const perfilRows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM vendedores WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
      [usuarioId, empresaId],
    ).catch(() => []);
    const perfilVendedorId = perfilRows[0]?.id;

    if (perfilVendedorId) {
      const rows = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM cierres_caja
         WHERE "empresaId" = $1 AND DATE(fecha) = $2
           AND estado = 'abierta' AND "vendedorId" = $3 LIMIT 1`,
        [empresaId, hoy, perfilVendedorId],
      );
      if (rows[0]?.id) return rows[0].id;
    }

    // 3. Ninguna caja encontrada → recibo no se imputa a ninguna caja
    return null;
  }

  async crear(dto: CreateReciboDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const monto     = Number(dto.monto);

    // ── 0. Resolver moneda: si hay facturaId, heredarla de la factura ─
    let moneda = dto.moneda ?? 'DOP';
    if (dto.facturaId) {
      const factura = await this.facturaRepo.findOne({ where: { id: dto.facturaId, empresaId } });
      if (factura?.moneda) moneda = factura.moneda;
      if (factura?.anulacionPendiente) {
        // Cargar la NC activa que causó el bloqueo para dar contexto al cajero
        const [ncInfo] = await this.dataSource.query<{
          ncNumero: string; ncEstado: string; estadoDGII: string | null;
        }[]>(
          `SELECT nc.numero AS "ncNumero", nc.estado AS "ncEstado",
                  e."estadoDGII"
           FROM notas_credito nc
           LEFT JOIN ecf e ON e."documentoOrigenId" = nc.id
                          AND e."documentoOrigenTipo" = 'NOTA_CREDITO'
           WHERE nc."facturaOriginalId" = $1 AND nc."empresaId" = $2
             AND nc.estado = 'emitida' AND nc."isActive" = true
           ORDER BY nc."createdAt" DESC LIMIT 1`,
          [dto.facturaId, empresaId],
        );
        const ncDetalle = ncInfo
          ? ` Nota de crédito ${ncInfo.ncNumero} en estado "${ncInfo.estadoDGII ?? ncInfo.ncEstado}".`
          : '';
        throw new BadRequestException(
          `Factura #${dto.facturaId} tiene una anulación total pendiente de confirmación DGII y no acepta cobros.` +
          `${ncDetalle} Consulte a Contabilidad para resolver la nota de crédito antes de registrar este cobro.`,
        );
      }
    }

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

    // ── 2b. Resolver clienteNombre si no vino en el DTO ────────────
    if (!dto.clienteNombre && dto.clienteId) {
      const rows = await this.dataSource.query<{ nombre: string }[]>(
        `SELECT nombre FROM clientes WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [dto.clienteId, empresaId],
      );
      if (rows[0]?.nombre) dto.clienteNombre = rows[0].nombre;
    }

    // ── 3. Resolver caja diaria y guardar recibo ───────────────────
    const cajaDiariaId = await this.resolverCajaDiaria(empresaId, usuarioId, dto.vendedorId);
    const numero    = await this.generarNumero();
    // Número secuencial del registro en pagos_cobrados (RDP-XXXXX).
    // Se genera aquí —antes de la transacción— para que el contador se
    // incremente en su propio lock atómico, independientemente del tx.
    const rdpNumero = await generarNumeroSecuencial(
      this.dataSource, 'pagos_cobrados', 'numero', '^RDP-[0-9]+$', 'RDP-', 1, empresaId,
    );
    const recibo = await this.repo.save(
      this.repo.create({
        ...dto,
        empresaId,
        numero,
        moneda,
        cajaDiariaId: cajaDiariaId ?? undefined,
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

      // Mapeo MetodoPagoRecibo → MetodoPago (depósito no existe en MetodoPago)
      const METODO_MAP: Record<string, MetodoPago> = {
        efectivo:      MetodoPago.EFECTIVO,
        transferencia: MetodoPago.TRANSFERENCIA,
        cheque:        MetodoPago.CHEQUE,
        tarjeta:       MetodoPago.TARJETA,
        deposito:      MetodoPago.TRANSFERENCIA,
        otro:          MetodoPago.OTRO,
      };

      await this.dataSource.transaction(async (em) => {
        // 1. Registrar pago en pagos_cobrados → alimenta el historial de cobros
        const pagoRepo = em.getRepository(PagoCobrado);
        await pagoRepo.save(pagoRepo.create({
          cuentaPorCobrarId: cxc!.id,
          monto:      montoParaCxc,
          fecha:      dto.fecha ? new Date(dto.fecha) : new Date(),
          metodoPago: METODO_MAP[dto.metodoPago] ?? MetodoPago.OTRO,
          referencia: dto.referencia,
          notas:      `Recibo ${recibo.numero}${dto.notas ? ' — ' + dto.notas : ''}`,
          userId:     usuarioId,
          moneda,
          tipoCambio: 1,
          numero:     rdpNumero,   // RDP-XXXXX — NOT NULL en pagos_cobrados
          empresaId,               // necesario para el índice único (empresaId, numero)
        }));

        // 2. Actualizar saldos de CxC
        await em.getRepository(CuentaPorCobrar).update(cxc!.id, {
          montoPagado:    nuevoPagado,
          montoPendiente: nuevoPendiente,
          estado:         nuevoEstado as any,
        });

        // 3. Marcar factura como PAGADA si el saldo quedó en 0
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
          const hoy = fechaHoyRD();
          const [cajaRow] = await this.dataSource.query<{ id: number }[]>(
            `SELECT id FROM cierres_caja WHERE "empresaId" = $1 AND DATE(fecha) = $2 AND estado = 'abierta' ORDER BY id DESC LIMIT 1`,
            [empresaId, hoy],
          ).catch(() => []);
          const antNumero = await generarNumeroSecuencial(
            this.dataSource, 'anticipo_cliente', 'numero', '^ANT-[0-9]+$', 'ANT-', 1, empresaId,
          );

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
          // Marcar el pago_cobrado asociado como inactivo para que no aparezca
          // en el estado de cuenta ni en el historial de cobros del cliente.
          await em.getRepository(PagoCobrado).update(
            { cuentaPorCobrarId: cxc.id, notas: Like(`Recibo ${recibo.numero}%`), isActive: true },
            { isActive: false },
          );
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

  /**
   * Cambia la forma de pago de un recibo activo.
   * Anula el recibo original (revirtiendo CxC/Factura/asiento) y crea uno nuevo
   * con la misma data pero con la nueva forma de pago. Solo permitido si la caja
   * del recibo sigue abierta.
   */
  async cambiarFormaPago(
    id:         number,
    nuevaForma: MetodoPagoRecibo,
    referencia: string | undefined,
    usuarioId:  number,
  ) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const recibo    = await this.findOne(id);

    if (recibo.metodoPago === nuevaForma) {
      throw new BadRequestException('La nueva forma de pago es la misma que la actual.');
    }

    // Verificar que la caja asignada sigue abierta
    if (recibo.cajaDiariaId) {
      const [caja] = await this.dataSource.query<{ estado: string }[]>(
        `SELECT estado FROM cierres_caja WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [recibo.cajaDiariaId, empresaId],
      );
      if (!caja || caja.estado !== 'abierta') {
        throw new BadRequestException(
          'La caja de este recibo ya está cerrada. No se puede cambiar la forma de pago. ' +
          'Contacte al administrador para gestionarlo.',
        );
      }
    }

    const numeroAnterior = recibo.numero;

    // Anular el recibo original — revierte CxC, Factura, pago_cobrado y asiento
    await this.eliminar(id);

    // Crear el nuevo recibo con la nueva forma de pago
    const resultado = await this.crear({
      clienteId:     recibo.clienteId,
      clienteNombre: recibo.clienteNombre,
      fecha:         recibo.fecha,          // ya es string YYYY-MM-DD
      monto:         Number(recibo.monto),
      metodoPago:    nuevaForma,
      concepto:      recibo.concepto,
      facturaId:     recibo.facturaId,
      facturaFolio:  recibo.facturaFolio,
      cxcId:         recibo.cxcId,
      referencia:    referencia ?? recibo.referencia,
      notas:         `Reemisión de ${numeroAnterior}${recibo.notas ? ' — ' + recibo.notas : ''}`,
      moneda:        recibo.moneda,
      nombreUsuario: recibo.nombreUsuario,
    }, usuarioId);

    const reciboNuevo = (resultado as any)?.recibo ?? resultado;
    this.logger.log(
      `[cambiarFormaPago] ${numeroAnterior} anulado → ${reciboNuevo?.numero ?? '?'} (${nuevaForma})`,
    );
    return { reciboAnulado: numeroAnterior, reciboNuevo };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = fechaHoyRD();
    const mes = mesHoyRD();

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
