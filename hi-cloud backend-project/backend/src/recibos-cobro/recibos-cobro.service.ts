import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
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
import { reportServiceError } from '../common/observability/sentry';
import { resolverCajaDiariaAbierta } from '../common/caja/resolver-caja-diaria.util';

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

  /** Caja diaria abierta para este recibo — ver common/caja/resolver-caja-diaria.util.ts
   *  (compartido con cxc.service.ts/cxp.service.ts desde el incidente 2026-10-15/16). */
  private async resolverCajaDiaria(
    empresaId: number,
    usuarioId: number,
    vendedorId?: number,
  ): Promise<number | null> {
    return resolverCajaDiariaAbierta(this.dataSource, empresaId, usuarioId, vendedorId);
  }

  /**
   * Todas las CxC pendientes de un cliente, más antigua primero — la base de
   * la aplicación FIFO (ver calcularAplicacionFifo). Solo de la MISMA
   * moneda que el recibo: aplicar RD$ a una factura en US$ sin tipo de
   * cambio explícito sería un monto inventado, igual que exige hoy el
   * selector manual de "Factura de referencia" (que también es por cliente,
   * sin cruzar monedas).
   */
  private async resolverPendientesCliente(
    clienteId: number, empresaId: number, moneda: string,
  ): Promise<CuentaPorCobrar[]> {
    return this.cxcRepo.find({
      where: {
        clienteId, empresaId, moneda, isActive: true,
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL, EstadoCuenta.VENCIDA]),
      },
      order: { fechaVencimiento: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Reparte `monto` entre las CxC pendientes, de la más antigua a la más
   * nueva, hasta agotarlo o quedarse sin facturas. Lo que sobra es
   * `excedente` — crear() lo convierte en anticipo (con confirmación del
   * cajero, igual que ya hacía para una sola factura).
   *
   * Incidente real (2026-10-16, empresa 73): un recibo "Karla Jiménez
   * RD$685.00" sin "Factura de referencia" se guardaba como cobro genérico
   * y la cliente seguía debiendo los mismos RD$685.00 en Antigüedad de
   * Saldos — nada en el código buscaba sus CxC pendientes. Pura coincidencia
   * reveladora: RD$685.00 es la suma EXACTA de sus 6 facturas pendientes —
   * el cajero cobró todo lo que debía de una vez, sin elegir factura por
   * factura, y el sistema no sabía qué hacer con eso.
   */
  private calcularAplicacionFifo(
    pendientes: CuentaPorCobrar[], monto: number,
  ): { aplicaciones: { cxc: CuentaPorCobrar; monto: number }[]; excedente: number } {
    let restante = monto;
    const aplicaciones: { cxc: CuentaPorCobrar; monto: number }[] = [];
    for (const cxc of pendientes) {
      if (restante <= 0.01) break;
      const pendiente = Number(cxc.montoPendiente);
      const aplicado = Math.min(restante, pendiente);
      if (aplicado > 0.01) {
        aplicaciones.push({ cxc, monto: +aplicado.toFixed(2) });
        restante = +(restante - aplicado).toFixed(2);
      }
    }
    return { aplicaciones, excedente: Math.max(0, +restante.toFixed(2)) };
  }

  /**
   * Previsualización para el formulario — "a qué facturas se aplicará" antes
   * de grabar (pedido explícito, incidente 2026-10-16). Misma lógica que
   * crear() usará de verdad, nunca una copia que pueda desincronizarse.
   */
  async previsualizarAplicacion(clienteId: number, monto: number, facturaId?: number, moneda = 'DOP') {
    const empresaId = this.tenantSvc.getEmpresaId();
    if (facturaId) {
      const cxc = await this.cxcRepo.findOne({ where: { facturaId, empresaId, isActive: true } });
      if (!cxc || [EstadoCuenta.PAGADA, EstadoCuenta.ANULADA].includes(cxc.estado as EstadoCuenta)) {
        return { aplicaciones: [], excedente: monto };
      }
      const aplicado = Math.min(monto, Number(cxc.montoPendiente));
      return {
        aplicaciones: [{ facturaId: cxc.facturaId, cxcId: cxc.id, monto: +aplicado.toFixed(2) }],
        excedente: +(monto - aplicado).toFixed(2),
      };
    }
    const pendientes = await this.resolverPendientesCliente(clienteId, empresaId, moneda);
    const { aplicaciones, excedente } = this.calcularAplicacionFifo(pendientes, monto);
    return {
      aplicaciones: aplicaciones.map(a => ({ facturaId: a.cxc.facturaId, cxcId: a.cxc.id, monto: a.monto })),
      excedente,
    };
  }

  /**
   * Registra el monto como anticipo del cliente — reutilizado por el
   * excedente sobre lo pendiente (cxc parcial) y por un recibo sin ninguna
   * CxC pendiente (cxc.length === 0): en ambos casos es dinero que el
   * cliente adelantó sin que haya, hoy, una factura a la que aplicarlo.
   */
  private async crearAnticipoDesdeRecibo(
    empresaId: number, clienteId: number, monto: number, descripcion: string,
    dto: CreateReciboDto, usuarioId: number,
  ) {
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
          clienteId,
          clienteNombre: dto.clienteNombre,
          monto,
          montoPendiente: monto,
          tipoPago:      dto.metodoPago,
          descripcion,
          estado:        EstadoAnticipo.ACTIVO,
          fechaRegistro: hoy,
          cajaDiariaId:  cajaRow?.id,
          usuarioId,
          nombreUsuario: dto.nombreUsuario,
          empresaId,
        }),
      );

      // Asiento: DÉBITO Caja/Banco, CRÉDITO Anticipos de Clientes
      await this.asientosService.asientoAnticipo(monto, anticipo.id, dto.metodoPago, hoy, usuarioId)
        .then(async (asientoId) => { if (asientoId) await this.anticipoRepo.update(anticipo.id, { asientoId }); })
        .catch(err => this.logger.error(`Asiento anticipo ${anticipo.numero}: ${err.message}`));

      this.logger.log(`Anticipo ${anticipo.numero} creado — ${descripcion}`);
      return anticipo;
    } catch (err: any) {
      this.logger.error(`Error creando anticipo (${descripcion}): ${err.message}`);
      return null;
    }
  }

  async crear(dto: CreateReciboDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const monto     = Number(dto.monto);
    // No confiar en que el controller siempre puebla dto.fecha (hoy lo hace,
    // pero crear() es un método de servicio — otro caller futuro podría no
    // pasar por ahí). fechaHoyRD(), nunca new Date().
    const fecha     = dto.fecha ?? fechaHoyRD();

    // ── 0. Resolver moneda: si hay facturaId, heredarla de la factura ─
    let moneda = dto.moneda ?? 'DOP';
    let factura: Factura | null = null;
    if (dto.facturaId) {
      factura = await this.facturaRepo.findOne({ where: { id: dto.facturaId, empresaId } });
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
      // Si la factura no tiene CxC aún, no es un error — se trata como anticipo,
      // SALVO que sea una factura de CONTADO: esas nunca generan CxC porque ya
      // se cobraron al emitirse (asientoFacturaEmitida() debita Caja/Bancos por
      // su medio de pago, FIX 3 FASE A commit 2) — un recibo aquí sería una
      // doble compensación (acreditaría Clientes cuando nunca se le debitó
      // nada a esa cuenta por esta factura).
      if (!cxc && factura && factura.tipoPago !== 'CREDITO') {
        throw new BadRequestException(
          `Factura ${factura.folio ?? `#${dto.facturaId}`} es de contado — ya fue cobrada al emitirse. ` +
          `No se puede registrar otro cobro contra ella.`,
        );
      }
    }

    // ── 2. Validar CxC / calcular a qué se aplica ──────────────────
    //
    // Si se eligió factura/CxC: se aplica a ESA, como siempre.
    // Si NO se eligió ninguna pero sí hay cliente: se buscan TODAS sus CxC
    // pendientes y se reparte el monto de la más antigua a la más nueva
    // (FIFO) — ver calcularAplicacionFifo(). Antes de esto, un recibo sin
    // "Factura de referencia" nunca tocaba ninguna CxC (incidente
    // 2026-10-16, empresa 73: REC-101/102/103 por RD$685.00/1,819.03/
    // 2,969.00 — la suma EXACTA de las pendientes de cada cliente —
    // quedaron sin aplicar y los tres seguían debiendo lo mismo).
    if (cxc) {
      if (dto.clienteId && cxc.clienteId !== dto.clienteId) {
        throw new BadRequestException('La factura de referencia no pertenece al cliente seleccionado');
      }
      if ([EstadoCuenta.PAGADA, EstadoCuenta.ANULADA].includes(cxc.estado as EstadoCuenta)) {
        throw new BadRequestException(`La cuenta por cobrar está "${cxc.estado}" y no acepta más pagos`);
      }
    }

    let aplicaciones: { cxc: CuentaPorCobrar; monto: number }[] = [];
    let excedente = 0;
    if (cxc) {
      const aplicado = Math.min(monto, Number(cxc.montoPendiente));
      aplicaciones = [{ cxc, monto: +aplicado.toFixed(2) }];
      excedente = +(monto - aplicado).toFixed(2);
    } else if (dto.clienteId) {
      const pendientesFifo = await this.resolverPendientesCliente(dto.clienteId, empresaId, moneda);
      // Sin ninguna CxC pendiente, no hay nada que "exceder" — es un cobro
      // genérico (más abajo), no un excedente que necesite confirmación.
      const resultado = pendientesFifo.length
        ? this.calcularAplicacionFifo(pendientesFifo, monto)
        : { aplicaciones: [], excedente: 0 };
      aplicaciones = resultado.aplicaciones;
      excedente    = resultado.excedente;
    }

    if (excedente > 0.01 && !dto.registrarExcedente) {
      // El frontend debe preguntar al usuario y reenviar con registrarExcedente=true
      const totalPendiente = +(monto - excedente).toFixed(2);
      throw new BadRequestException(`EXCEDENTE:${excedente.toFixed(2)}:${totalPendiente.toFixed(2)}`);
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
    // EFECTIVO exige caja abierta — mismo criterio que cxc.service.ts/
    // cxp.service.ts (incidente 2026-10-15/16): antes un recibo en efectivo
    // sin caja abierta se guardaba igual, sin quedar imputado a ningún
    // cierre — el efectivo no aparecía en ningún cuadre.
    if (dto.metodoPago === MetodoPagoRecibo.EFECTIVO && !cajaDiariaId) {
      throw new BadRequestException('Debes tener una caja abierta para cobrar en efectivo.');
    }
    const numero    = await this.generarNumero();
    const recibo = await this.repo.save(
      this.repo.create({
        ...dto,
        fecha,
        empresaId,
        numero,
        moneda,
        cajaDiariaId: cajaDiariaId ?? undefined,
        usuarioId,
        // La CxC más antigua tocada (si hubo varias, vía FIFO) — solo para
        // mostrar algo en el detalle del recibo; la relación real, completa,
        // vive en pagos_cobrados.reciboCobroId (una fila por CxC aplicada).
        cxcId: aplicaciones[0]?.cxc.id ?? dto.cxcId,
      }),
    );

    // ── 4. Aplicar a cada CxC tocada (una transacción, una fila en
    //      pagos_cobrados por CxC — antes siempre era una sola; un recibo
    //      FIFO sin factura elegida puede pagar varias a la vez) ────────
    if (aplicaciones.length) {
      // Mapeo MetodoPagoRecibo → MetodoPago (depósito no existe en MetodoPago)
      const METODO_MAP: Record<string, MetodoPago> = {
        efectivo:      MetodoPago.EFECTIVO,
        transferencia: MetodoPago.TRANSFERENCIA,
        cheque:        MetodoPago.CHEQUE,
        tarjeta:       MetodoPago.TARJETA,
        deposito:      MetodoPago.TRANSFERENCIA,
        otro:          MetodoPago.OTRO,
      };

      // Un RDP-XXXXX por CxC aplicada — se generan ANTES de la transacción
      // (cada llamada tiene su propio lock atómico, mismo criterio que
      // siempre tuvo esta función para el caso de una sola factura).
      const rdpNumeros: string[] = [];
      for (let i = 0; i < aplicaciones.length; i++) {
        rdpNumeros.push(await generarNumeroSecuencial(
          this.dataSource, 'pagos_cobrados', 'numero', '^RDP-[0-9]+$', 'RDP-', 1, empresaId,
        ));
      }

      const pagosCreados: { pagoId: number; cxcId: number; monto: number }[] = [];
      await this.dataSource.transaction(async (em) => {
        const pagoRepo = em.getRepository(PagoCobrado);
        const cxcRepoTx = em.getRepository(CuentaPorCobrar);
        const factRepoTx = em.getRepository(Factura);

        for (let i = 0; i < aplicaciones.length; i++) {
          const ap = aplicaciones[i];
          const rdpNumero = rdpNumeros[i];

          const nuevoPagado    = Number((Number(ap.cxc.montoPagado) + ap.monto).toFixed(2));
          const nuevoPendiente = Number((Number(ap.cxc.montoOriginal) - nuevoPagado).toFixed(2));
          const nuevoEstado    = nuevoPendiente <= 0 ? EstadoCuenta.PAGADA : EstadoCuenta.PAGADA_PARCIAL;

          // 1. Registrar pago en pagos_cobrados → alimenta el historial de cobros
          const pagoGuardado = await pagoRepo.save(pagoRepo.create({
            cuentaPorCobrarId: ap.cxc.id,
            monto:      ap.monto,
            fecha,
            metodoPago: METODO_MAP[dto.metodoPago] ?? MetodoPago.OTRO,
            referencia: dto.referencia,
            notas:      `Recibo ${recibo.numero}${dto.notas ? ' — ' + dto.notas : ''}`,
            userId:     usuarioId,
            moneda,
            tipoCambio: 1,
            numero:     rdpNumero,   // RDP-XXXXX — NOT NULL en pagos_cobrados
            empresaId,               // necesario para el índice único (empresaId, numero)
            reciboCobroId: recibo.id, // vínculo real — listar() lo usa para no mostrar este pago aparte
          }));

          // 2. Actualizar saldos de esa CxC
          await cxcRepoTx.update(ap.cxc.id, {
            montoPagado:    nuevoPagado,
            montoPendiente: nuevoPendiente,
            estado:         nuevoEstado as any,
          });

          // 3. Marcar factura como PAGADA si el saldo quedó en 0
          if (nuevoEstado === EstadoCuenta.PAGADA && ap.cxc.facturaId) {
            await factRepoTx.update(ap.cxc.facturaId, { estado: FacturaEstado.PAGADA });
            this.logger.log(`Factura #${ap.cxc.facturaId} marcada como PAGADA — Recibo ${recibo.numero}`);
          }

          pagosCreados.push({ pagoId: pagoGuardado.id, cxcId: ap.cxc.id, monto: ap.monto });
        }
      });

      // Un asiento contable por cada CxC pagada (DÉBITO Bancos, CRÉDITO
      // Clientes) — granularidad por pago, igual que antes, ahora puede
      // haber más de uno por recibo.
      for (const p of pagosCreados) {
        await this.asientosService.asientoCobro(p.monto, p.pagoId, p.cxcId, fecha, usuarioId).catch(err =>
          this.logger.error(`Error asiento cobro ${recibo.numero} — pago #${p.pagoId}: ${err.message}`),
        );
      }

      // EFECTIVO nunca se postea a un banco — ya entró a la caja física del
      // día (recibos_cobro alimenta caja.service.ts directamente); postearlo
      // TAMBIÉN en tesorería lo habría contado dos veces en dos lugares
      // distintos (incidente 2026-10-15, empresa 53, mismo patrón).
      if (dto.metodoPago !== MetodoPagoRecibo.EFECTIVO) {
        await this.tesoreriaService.registrarMovimientoAutomatico(
          TipoMovimientoBancario.DEPOSITO,
          monto,
          `Recibo ${recibo.numero} — ${dto.clienteNombre ?? dto.concepto}`,
          OrigenMovimiento.COBRO_CXC,
          recibo.id,
          usuarioId,
        ).catch(err => {
          this.logger.error(`Error tesorería ${recibo.numero}: ${err.message}`);
          reportServiceError(err, 'recibosCobro.registrar.tesoreria', { reciboNumero: recibo.numero });
        });
      }

      // ── Excedente → crear anticipo automáticamente ─────────────
      if (excedente > 0.01 && dto.registrarExcedente) {
        const anticipo = await this.crearAnticipoDesdeRecibo(
          empresaId, aplicaciones[0].cxc.clienteId, excedente,
          `Excedente de Recibo ${recibo.numero}`, dto, usuarioId,
        );
        if (anticipo) return { recibo, anticipo };
      }
    } else if (dto.clienteId) {
      // Cliente conocido, pero SIN ninguna CxC pendiente — el monto queda
      // como anticipo (regla explícita, incidente 2026-10-16): un recibo de
      // un cliente nunca se pierde en un asiento genérico sin rastro de a
      // quién o para qué quedó disponible ese dinero.
      const anticipo = await this.crearAnticipoDesdeRecibo(
        empresaId, dto.clienteId, monto,
        `Recibo ${recibo.numero} — sin facturas pendientes al momento del cobro`, dto, usuarioId,
      );
      if (anticipo) return { recibo, anticipo };

      // El propio anticipo ya generó su asiento (DÉBITO Caja/Banco, CRÉDITO
      // Anticipos) — si por lo que sea no se pudo crear, cae al mismo
      // camino genérico de abajo en vez de perder el registro contable.
      await this.asientosService.asientoRecibo(
        monto, recibo.id, dto.metodoPago, fecha, usuarioId,
      ).catch(err =>
        this.logger.error(`Error asiento recibo ${recibo.numero}: ${err.message}`),
      );
      if (dto.metodoPago !== MetodoPagoRecibo.EFECTIVO) {
        await this.tesoreriaService.registrarMovimientoAutomatico(
          TipoMovimientoBancario.DEPOSITO, monto,
          `Recibo ${recibo.numero} — ${dto.clienteNombre ?? dto.concepto}`,
          OrigenMovimiento.COBRO_CXC, recibo.id, usuarioId,
        ).catch(err => {
          this.logger.error(`Error tesorería ${recibo.numero}: ${err.message}`);
          reportServiceError(err, 'recibosCobro.registrar.tesoreria', { reciboNumero: recibo.numero });
        });
      }
    } else {
      // Sin cliente — cobro genérico, sin ningún rastro de a quién
      // aplicarlo. Asiento: DÉBITO Caja/Bancos, CRÉDITO Clientes.
      await this.asientosService.asientoRecibo(
        monto, recibo.id, dto.metodoPago, fecha, usuarioId,
      ).catch(err =>
        this.logger.error(`Error asiento recibo ${recibo.numero}: ${err.message}`),
      );

      if (dto.metodoPago !== MetodoPagoRecibo.EFECTIVO) {
        await this.tesoreriaService.registrarMovimientoAutomatico(
          TipoMovimientoBancario.DEPOSITO,
          monto,
          `Recibo ${recibo.numero} — ${dto.concepto}`,
          OrigenMovimiento.COBRO_CXC,
          recibo.id,
          usuarioId,
        ).catch(err => {
          this.logger.error(`Error tesorería ${recibo.numero}: ${err.message}`);
          reportServiceError(err, 'recibosCobro.registrar.tesoreria', { reciboNumero: recibo.numero });
        });
      }
    }

    return recibo;
  }

  /**
   * Todos los cobros del cliente, de las DOS series que existen.
   *
   * ── Por qué es una unión y no un findAndCount ────────────────────────────
   * Hay dos tablas y dos numeraciones para lo que el usuario llama «recibos»:
   *
   *   REC-…  recibos_cobro   ← lo emite este módulo
   *   RDP-…  pagos_cobrados  ← lo emite Cuentas por Cobrar (POST /cxc/:id/pago)
   *
   * La separación fue deliberada para que los números no colisionaran (ver la
   * migración 1755400000000), pero nadie unió las dos en la pantalla. Y los RDP
   * se IMPRIMEN: GET /cxc/pagos/:id/pdf saca un papel titulado «RECIBO DE PAGO»
   * con número y sello. El cliente se lleva un recibo que después no aparecía en
   * ningún listado — el caso que lo destapó fue RDP-00038 de Ferretería Pavel,
   * que existía en papel y no en pantalla.
   *
   * ── El discriminador NO es decorativo ────────────────────────────────────
   * Los id de las dos tablas colisionan: recibos_cobro#5 y pagos_cobrados#5 son
   * documentos distintos. Sin `origen`, pulsar «Imprimir» en una fila RDP
   * llamaría a /recibos-cobro/5/pdf y sacaría OTRO recibo, de otro cliente y
   * otro monto. Por eso viaja en cada fila y el frontend enruta con él.
   *
   * ── Un cobro con CxC no son DOS filas (2026-09-22) ───────────────────────
   * Cuando "Nuevo Recibo" se emite contra una CxC, crear() escribe un REC- Y un
   * RDP- para el MISMO cobro (pagos_cobrados.reciboCobroId queda apuntando al
   * recibo). Antes de este fix el UNION mostraba las dos filas como si fueran
   * dos cobros distintos — mismo cliente, misma fecha, mismo monto, duplicado
   * — aunque el asiento contable nunca se duplicó (un solo INSERT en
   * asientos_contables por cobro real; auditado contra el backup de
   * producción antes de tocar esto). Se corrige EN LA CONSULTA, no en el
   * render: un pago con reciboCobroId ya está representado por su recibo, así
   * que la rama de pagos_cobrados lo excluye — Excel/CSV heredan la
   * corrección sin tocarlos, porque leen esta misma data.
   *
   * ── Documentos revertidos, marcados en vez de ocultos ────────────────────
   * eliminar() (anulación directa o reemisión vía cambiarFormaPago) deja
   * isActive=false en el recibo Y revierte su asiento con un REV-. Antes ese
   * filtro vivía en el WHERE y el recibo desaparecía sin dejar rastro. Ahora
   * se incluye igual — isActive viaja en la fila para que la pantalla lo
   * marque "Revertido" — porque un recibo que existió y se corrigió es
   * información, no ruido.
   */
  async listar(pagination: PaginationDto, clienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    // El filtro por cliente se aplica en las dos ramas: en recibos_cobro por su
    // propia columna, en pagos_cobrados a través de la CxC.
    const params: any[] = [empresaId];

    let filtroRecibo = '';
    let filtroPago   = '';

    if (clienteId) {
      params.push(clienteId);
      filtroRecibo += ` AND r."clienteId" = $${params.length}`;
      filtroPago   += ` AND cxc."clienteId" = $${params.length}`;
    }

    // El buscador de la pantalla —«número, cliente o factura»— se enviaba al
    // servidor desde siempre y aquí NUNCA se leía: escribir en la caja no
    // filtraba nada. Se implementa ahora que la lista une dos series, donde
    // encontrar un recibo concreto importa más.
    const texto = search?.trim();
    if (texto) {
      params.push(`%${texto}%`);
      const n = params.length;
      filtroRecibo += ` AND (r.numero ILIKE $${n} OR r."clienteNombre" ILIKE $${n} OR r."facturaFolio" ILIKE $${n})`;
      filtroPago   += ` AND (p.numero ILIKE $${n} OR cl.nombre ILIKE $${n} OR f.folio ILIKE $${n})`;
    }

    const union = `
      SELECT 'recibo'          AS origen,
             r.id,
             r.numero,
             -- ::text a proposito. La entidad declara fecha como columna 'date' y
             -- TypeORM la devolvia como 'YYYY-MM-DD'; esta consulta es CRUDA y el
             -- driver la convierte en Date, que se serializa como
             -- 2026-09-07T00:00:00.000Z y asi se pintaba en la tabla y en el detalle.
             -- Castear aqui conserva el contrato que ya tenian las pantallas.
             r.fecha::text               AS fecha,
             r."clienteId",
             r."clienteNombre",
             -- ::text en LAS DOS ramas. recibos_cobro.metodoPago y
             -- pagos_cobrados.metodoPago son enums de Postgres DISTINTOS
             -- (MetodoPagoRecibo vs MetodoPago), y un UNION no sabe convertir
             -- uno en el otro: revienta con «could not convert type». Castear
             -- solo una rama no arregla nada — tienen que ser las dos.
             r."metodoPago"::text        AS "metodoPago",
             r.monto,
             r.concepto,
             r."facturaFolio",
             r."cajaDiariaId",
             r."nombreUsuario",
             r.moneda,
             r."isActive"                AS "isActive",
             pc_link.numero              AS "pagoNumero"
        FROM recibos_cobro r
        LEFT JOIN pagos_cobrados pc_link ON pc_link."reciboCobroId" = r.id
       WHERE r."empresaId" = $1 ${filtroRecibo}

      UNION ALL

      SELECT 'pago'            AS origen,
             p.id,
             p.numero,
             p.fecha::text               AS fecha,
             cxc."clienteId",
             cl.nombre         AS "clienteNombre",
             p."metodoPago"::text        AS "metodoPago",
             p.monto,
             'Cobro sobre factura ' || f.folio AS concepto,
             f.folio           AS "facturaFolio",
             -- Un RDP nunca se imputa a una caja: cxc.registrarPago() no toca
             -- cajaDiariaId. Va explícito en NULL para que la pantalla lo pueda
             -- señalar en vez de dejarlo parecer un cobro que sí entró al arqueo.
             NULL::int         AS "cajaDiariaId",
             u.nombre          AS "nombreUsuario",
             p.moneda,
             true                        AS "isActive",
             NULL::varchar               AS "pagoNumero"
        FROM pagos_cobrados p
        JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
        JOIN facturas f             ON f.id  = cxc."facturaId"
        JOIN clientes cl            ON cl.id = cxc."clienteId"
        LEFT JOIN users u           ON u.id  = p."userId"
       WHERE f."empresaId" = $1 AND p."isActive" = true
         -- Ya representado por su REC- en la rama de arriba — mostrarlo aquí
         -- también duplicaría el cobro en pantalla y en Excel/CSV.
         AND p."reciboCobroId" IS NULL
         ${filtroPago}
    `;

    const [{ total }] = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total FROM (${union}) AS todos`,
      params,
    );

    const data = await this.dataSource.query<any[]>(
      `SELECT * FROM (${union}) AS todos
        ORDER BY fecha DESC, numero DESC
        LIMIT ${take} OFFSET ${skip}`,
      params,
    );

    return {
      data,
      meta: {
        total: Number(total),
        page, limit: take,
        totalPages: Math.ceil(Number(total) / take),
      },
    };
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

    // ── 1. Revertir CADA CxC que este recibo pagó ──────────────────
    //
    // Por reciboCobroId (en pagos_cobrados), no por recibo.cxcId ni por el
    // monto TOTAL del recibo: un recibo FIFO (crear(), sin "Factura de
    // referencia") puede haber pagado varias CxC a la vez, cada una por un
    // monto DISTINTO al monto completo del recibo. Revertir con el monto
    // total contra una sola CxC —lo que hacía esto antes— ya era incorrecto
    // incluso en el caso de una sola factura con excedente: solo se le
    // había aplicado el pendiente, no el monto completo del recibo, así que
    // restar el monto completo al anular dejaba montoPagado mal (de más).
    const pagos = await this.pagoRepo.find({ where: { reciboCobroId: recibo.id, isActive: true } });

    for (const pago of pagos) {
      const cxc = await this.cxcRepo.findOne({ where: { id: pago.cuentaPorCobrarId, empresaId, isActive: true } });
      if (!cxc) continue;

      const montoPago           = Number(pago.monto);
      const nuevoMontoPagado    = Math.max(0, +(Number(cxc.montoPagado) - montoPago).toFixed(2));
      const nuevoMontoPendiente = +(Number(cxc.montoOriginal) - nuevoMontoPagado).toFixed(2);
      const nuevoEstado =
        nuevoMontoPagado <= 0   ? EstadoCuenta.PENDIENTE :
        nuevoMontoPendiente > 0 ? EstadoCuenta.PAGADA_PARCIAL :
                                   EstadoCuenta.PAGADA;

      await this.dataSource.transaction(async (em) => {
        await em.getRepository(CuentaPorCobrar).update(cxc.id, {
          montoPagado:    nuevoMontoPagado,
          montoPendiente: nuevoMontoPendiente,
          estado:         nuevoEstado as any,
        });
        // Revertir estado de factura si había quedado PAGADA por este pago
        if (cxc.facturaId && nuevoEstado !== EstadoCuenta.PAGADA) {
          await em.getRepository(Factura).update(cxc.facturaId, {
            estado: FacturaEstado.EMITIDA,
          });
        }
        await em.getRepository(PagoCobrado).update(pago.id, { isActive: false });
      });

      // Asiento de reversión: CRÉDITO Bancos, DÉBITO Clientes (inverso del cobro) — uno por CxC revertida.
      await this.asientosService.asientoReversion(
        montoPago, cxc.id, recibo.id, 'recibo', fechaHoyRD(), recibo.usuarioId,
      ).catch(err => this.logger.error(`Error asiento reversión ${recibo.numero} — CxC #${cxc.id}: ${err.message}`));
    }

    // Compatibilidad con recibos antiguos (anteriores a reciboCobroId en
    // pagos_cobrados): si no se encontró ningún pago por esa vía pero el
    // recibo sí tenía un cxcId directo, revertir con el método de siempre.
    if (!pagos.length && recibo.cxcId) {
      const monto = Number(recibo.monto);
      const cxc = await this.cxcRepo.findOne({ where: { id: recibo.cxcId, empresaId, isActive: true } });
      if (cxc) {
        const nuevoMontoPagado    = Math.max(0, +(Number(cxc.montoPagado) - monto).toFixed(2));
        const nuevoMontoPendiente = +(Number(cxc.montoOriginal) - nuevoMontoPagado).toFixed(2);
        const nuevoEstado =
          nuevoMontoPagado <= 0   ? EstadoCuenta.PENDIENTE :
          nuevoMontoPendiente > 0 ? EstadoCuenta.PAGADA_PARCIAL :
                                     EstadoCuenta.PAGADA;
        await this.dataSource.transaction(async (em) => {
          await em.getRepository(CuentaPorCobrar).update(cxc.id, {
            montoPagado: nuevoMontoPagado, montoPendiente: nuevoMontoPendiente, estado: nuevoEstado as any,
          });
          if (cxc.facturaId && nuevoEstado !== EstadoCuenta.PAGADA) {
            await em.getRepository(Factura).update(cxc.facturaId, { estado: FacturaEstado.EMITIDA });
          }
        });
        await this.asientosService.asientoReversion(
          monto, recibo.cxcId, recibo.id, 'recibo', fechaHoyRD(), recibo.usuarioId,
        ).catch(err => this.logger.error(`Error asiento reversión ${recibo.numero}: ${err.message}`));
      }
    }

    // ── 2. Anular el recibo ───────────────────────────────────────────
    await this.repo.update(id, { isActive: false });
    return {
      ok: true,
      mensaje: pagos.length
        ? `Recibo ${recibo.numero} anulado y ${pagos.length} CxC revertida(s)`
        : `Recibo ${recibo.numero} anulado`,
    };
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

  /**
   * Totales de cobros — de las DOS series, igual que el listado.
   *
   * Si el resumen contara solo los REC y la lista enseñara REC + RDP, la
   * pantalla diría «3 recibos hoy» encima de una tabla con cinco filas. Es el
   * mismo criterio que en las alertas de stock: una sola definición, o el
   * contador y la lista discuten entre ellos.
   */
  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy = fechaHoyRD();
    const mes = mesHoyRD();

    // Los RDP viven en otra tabla y se suman aparte para no duplicar el SQL de
    // la unión: aquí solo hacen falta importes y conteos, no las columnas.
    const pagosDe = async (filtroFecha: string, valor: string) => {
      const [row] = await this.dataSource.query<{ total: string; cantidad: string }[]>(
        `SELECT COALESCE(SUM(p.monto),0)::text AS total, COUNT(p.id)::text AS cantidad
           FROM pagos_cobrados p
           JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
           JOIN facturas f             ON f.id  = cxc."facturaId"
          WHERE f."empresaId" = $1 AND p."isActive" = true ${filtroFecha}`,
        valor ? [empresaId, valor] : [empresaId],
      );
      return { total: Number(row?.total ?? 0), cantidad: Number(row?.cantidad ?? 0) };
    };

    const [pagosHoy, pagosMes, pagosTotal] = await Promise.all([
      pagosDe('AND p.fecha = $2', hoy),
      pagosDe(`AND TO_CHAR(p.fecha::date, 'YYYY-MM') = $2`, mes),
      pagosDe('', ''),
    ]);

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
      hoy: {
        total:    +(Number(hoyR?.total ?? 0) + pagosHoy.total).toFixed(2),
        cantidad:  Number(hoyR?.cantidad ?? 0) + pagosHoy.cantidad,
      },
      mes: {
        total:    +(Number(mesR?.total ?? 0) + pagosMes.total).toFixed(2),
      },
      total: {
        total:    +(Number(totalR?.total ?? 0) + pagosTotal.total).toFixed(2),
        cantidad:  Number(totalR?.cantidad ?? 0) + pagosTotal.cantidad,
      },
    };
  }
}
