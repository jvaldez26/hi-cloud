import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull, EntityManager } from 'typeorm';
import { generarNumeroSecuencial } from '../../common/utils/generar-numero.util';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { AsientoContable, TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { TenantService } from '../../tenant/tenant.service';
import { reportServiceError } from '../../common/observability/sentry';
import { ConfiguracionContableService } from './configuracion-contable.service';

// Códigos del plan de cuentas dominicano — movidos a un archivo de
// constantes propio (2026-09-19) para que ConfiguracionContableService los
// use como default de cada concepto configurable sin crear una dependencia
// circular; re-exportados aquí porque contabilidad.service.ts y otros ya
// los importan de este archivo (marcar cuentas como esCuentaSistema, P3
// Bloque 4: si un contador les cambia el código, este motor deja de
// encontrarlas y el asiento correspondiente muere en silencio para toda
// la empresa).
export { COD } from '../constants/cod-cuentas.constants';
import { COD } from '../constants/cod-cuentas.constants';

/** Una línea de asiento antes de resolver su código contra el catálogo. */
export interface LineaAsientoInput {
  codigo: string;
  descripcion: string;
  debe: number;
  haber: number;
  /** true = el usuario eligió esta cuenta a propósito, distinta de la que el motor habría usado por defecto (auditoría). */
  manual?: boolean;
}

/**
 * Panel de vista previa del asiento (tarea 2026-09-19) — lo que devuelve
 * `resolverLineasAsiento()`/`previsualizarLineas()`: la MISMA resolución de
 * cuentas y las MISMAS validaciones (permiteMovimientos, partida doble) que
 * usa `_crearAsientoContabilizado()` antes de persistir, para que la vista
 * previa nunca pueda mostrar algo distinto de lo que el motor generaría de
 * verdad — una sola fuente de verdad, sin réplica de lógica en el frontend.
 */
export interface PreviewAsientoLinea {
  codigo: string;
  nombre: string;
  debe: number;
  haber: number;
}
export interface PreviewAsientoResultado {
  ok: boolean;
  lineas: PreviewAsientoLinea[];
  totalDebe: number;
  totalHaber: number;
  cuadrado: boolean;
  /** Motivo legible cuando ok=false — "falta la cuenta X", "el asiento no cuadra", etc. Nunca falla en silencio. */
  error?: string;
  /** Aviso NO bloqueante con ok=true — p. ej. costo de venta omitido por falta de historial de compra (Fase 4, Bloque C). Se advierte en pantalla, nunca en silencio. */
  advertencia?: string;
}

type ResolverLineasResultado =
  | {
      ok: true;
      lineasResueltas: { cuenta: CuentaContable; descripcion: string; debe: number; haber: number; manual?: boolean }[];
      totalDebe: number;
      totalHaber: number;
    }
  | { ok: false; tipo: 'asiento_cuenta_no_encontrada'; codigoCuenta: string; mensaje: string }
  | { ok: false; tipo: 'asiento_cuenta_agrupacion'; codigoCuenta: string; nombreCuenta: string; mensaje: string }
  | { ok: false; tipo: 'asiento_descuadrado'; totalDebe: number; totalHaber: number; mensaje: string };

@Injectable()
export class AsientosAutomaticosService {
  private readonly logger = new Logger(AsientosAutomaticosService.name);

  constructor(
    @InjectRepository(CuentaContable)
    private cuentaRepository:  Repository<CuentaContable>,
    @InjectRepository(AsientoContable)
    private asientoRepository: Repository<AsientoContable>,
    @InjectRepository(AsientoLinea)
    private lineaRepository:   Repository<AsientoLinea>,
    private tenantService:     TenantService,
    @InjectDataSource() private dataSource: DataSource,
    private configuracionService: ConfiguracionContableService,
  ) {}

  private get eid(): number | undefined {
    try { return this.tenantService.getEmpresaId(); } catch { return undefined; }
  }

  /**
   * Resuelve un concepto contable configurable (Configuración Contable por
   * Módulo, 2026-09-19) contra la configuración de la empresa, cayendo a
   * `fallback` (el código que el motor usaba hardcodeado antes de esta
   * pantalla) sin contexto de empresa o si algo falla — un problema de
   * configuración nunca debe tumbar la generación del asiento, la resolución
   * de cuentas de resolverLineasAsiento() sigue siendo quien valida que la
   * cuenta resultante exista de verdad.
   */
  private async resolverCuentaConcepto(concepto: string, fallback: string): Promise<string> {
    const eid = this.eid;
    if (eid === undefined) return fallback;
    try {
      return await this.configuracionService.resolverCuenta(eid, concepto);
    } catch {
      return fallback;
    }
  }

  // Cobros/pagos por método — antes un ternario binario (efectivo → Caja,
  // cualquier otra cosa → Bancos): tarjeta, transferencia y cheque eran
  // indistinguibles. Ahora cada método es su propio concepto configurable;
  // el fallback preserva EXACTAMENTE el comportamiento de antes para toda
  // empresa que no configure nada.
  private static readonly CONCEPTO_POR_METODO_PAGO: Record<string, string> = {
    efectivo:      'CAJA',
    tarjeta:       'COBRO_TARJETA',
    transferencia: 'COBRO_TRANSFERENCIA',
    cheque:        'COBRO_CHEQUE',
  };

  private async resolverCuentaPorMetodoPago(metodoPago: string): Promise<string> {
    const concepto  = AsientosAutomaticosService.CONCEPTO_POR_METODO_PAGO[metodoPago] ?? 'COBRO_OTRO';
    const fallback  = metodoPago === 'efectivo' ? COD.CAJA : COD.BANCOS;
    return this.resolverCuentaConcepto(concepto, fallback);
  }

  // FIX 3, FASE A (2026-09-20) — traduce el "tipo" NUMÉRICO de FormaPagoDto
  // (create-factura.dto.ts) al string que espera resolverCuentaPorMetodoPago().
  // tipo=2 ("Cheque/Transfer") es una sola opción del formulario que cubre
  // ambos medios — se resuelve como 'transferencia' (mismo fallback COD.BANCOS
  // que 'cheque' si la empresa no configuró cuentas separadas). tipo=4 es la
  // marca de "va a crédito", nunca un medio de pago — se maneja aparte en
  // lineasDeCobroFactura(), nunca llega a este mapa.
  private static readonly METODO_POR_TIPO_FORMA_PAGO: Record<number, string> = {
    1: 'efectivo', 2: 'transferencia', 3: 'tarjeta', 5: 'permuta', 6: 'nc',
  };

  /**
   * FIX 3, FASE A commit 2 (2026-09-20) — antes, TODA factura (de contado o a
   * crédito) debitaba Clientes por el neto completo: una venta de contado
   * nunca generaba automáticamente el cobro que la compensara, así que
   * Clientes se inflaba para siempre con cada venta de contado (RD$7.77M en
   * una sola empresa, ver diagnóstico). Ahora:
   *   - CONTADO con formasPago: una línea de débito por cada medio de pago
   *     real (tipo≠4), a la cuenta que resuelva resolverCuentaPorMetodoPago().
   *   - CONTADO sin formasPago (factura legacy o creada por un camino que no
   *     las registra): todo a Caja — nunca a Clientes.
   *   - CREDITO: Clientes por el SALDO — nunca por lo que traiga la entrada
   *     tipo=4 en sí (puede venir con la propina mezclada, que esta función
   *     no modela — ver validarFormasPago en facturas.service.ts). El saldo
   *     se DERIVA como neto − abono, donde abono es la suma de las entradas
   *     que SÍ son un medio de pago real. Así la partida doble cuadra exacto
   *     sin importar qué traiga la marca de crédito.
   *   - CREDITO sin formasPago (camino legacy que no las registra): Clientes
   *     por el neto completo — comportamiento idéntico al de antes de este
   *     commit, cero cambio para esos casos.
   *
   * Si la cuenta que resuelve un medio de pago no existe en el catálogo de
   * la empresa, NO se descarta el asiento completo en silencio (como haría
   * resolverLineasAsiento con cualquier otra cuenta faltante) — se reporta a
   * Sentry y se cae a Caja para esa línea puntual, porque Caja es la única
   * cuenta que FASE A commit 1 garantizó en el catálogo de toda empresa
   * activa antes de desplegar este motor.
   */
  private async lineasDeCobroFactura(
    neto: number, folio: string,
    pago: { tipoPago: 'CONTADO' | 'CREDITO'; formasPago?: { tipo: number; monto: number }[] } | undefined,
    cuentaClientes: string, cuentaCaja: string,
  ): Promise<{ codigo: string; descripcion: string; debe: number; haber: number }[]> {
    const tipoPago = pago?.tipoPago ?? 'CREDITO'; // sin dato: comportamiento legacy (siempre fue Clientes)
    const formas = (pago?.formasPago ?? []).filter(f => Number(f.monto) > 0);

    if (!formas.length) {
      if (tipoPago === 'CREDITO') {
        return [{ codigo: cuentaClientes, descripcion: `Cta. por cobrar ${folio}`, debe: neto, haber: 0 }];
      }
      return [{ codigo: cuentaCaja, descripcion: `Cobro en efectivo ${folio}`, debe: neto, haber: 0 }];
    }

    const entradasPago = formas.filter(f => f.tipo !== 4);
    const lineasPago: { codigo: string; descripcion: string; debe: number; haber: number }[] = [];
    for (const f of entradasPago) {
      const metodo = AsientosAutomaticosService.METODO_POR_TIPO_FORMA_PAGO[f.tipo] ?? 'otro';
      let codigo = await this.resolverCuentaPorMetodoPago(metodo);
      if (!(await this.getCuenta(codigo, this.eid ?? -1))) {
        this.reportarFalloAsiento(
          new Error(`Cuenta ${codigo} (medio de pago "${metodo}") no existe en el catálogo — se usa Caja como respaldo`),
          'asiento_metodo_pago_cuenta_faltante',
          { referenciaFolio: folio, metodoPago: metodo, codigoFaltante: codigo },
        );
        codigo = COD.CAJA;
      }
      lineasPago.push({ codigo, descripcion: `Cobro ${metodo} ${folio}`, debe: Number(Number(f.monto).toFixed(2)), haber: 0 });
    }

    if (tipoPago !== 'CREDITO') {
      // CONTADO — cada medio de pago por su monto. Si la suma no cuadra
      // exacto contra `neto` (p. ej. por la propina, que aquí no se modela),
      // lo corrige o lo rechaza y reporta _crearAsientoContabilizado, igual
      // que cualquier otro asiento — no se duplica esa lógica aquí.
      return lineasPago;
    }

    const abono = Number(lineasPago.reduce((s, l) => s + l.debe, 0).toFixed(2));
    const saldoClientes = Number((neto - abono).toFixed(2));
    if (saldoClientes <= 0) {
      // El abono ya cubre (o excede) el neto — no debería pasar si tipoPago
      // vino bien derivado; si pasa, se reporta y se cae al comportamiento
      // legacy (todo a Clientes) en vez de generar una línea en cero o
      // negativa en silencio.
      this.reportarFalloAsiento(
        new Error(`Factura ${folio}: tipoPago CREDITO pero el abono (${abono}) cubre o excede el neto (${neto})`),
        'asiento_credito_sin_saldo', { referenciaFolio: folio },
      );
      return [{ codigo: cuentaClientes, descripcion: `Cta. por cobrar ${folio}`, debe: neto, haber: 0 }];
    }
    return [
      { codigo: cuentaClientes, descripcion: `Cta. por cobrar (saldo) ${folio}`, debe: saldoClientes, haber: 0 },
      ...lineasPago,
    ];
  }

  /**
   * Igual que resolverCuentaConcepto(), pero para varios conceptos de un
   * mismo asiento en UNA sola llamada a obtenerMapa() (que ya está cacheado
   * por empresa) — evita N resoluciones independientes cuando un asiento usa
   * varios conceptos configurables (p. ej. Clientes+Ventas+ITBIS+Costo de
   * Venta+Inventario en una factura).
   */
  private async resolverCuentasConcepto(pares: Array<[concepto: string, fallback: string]>): Promise<Record<string, string>> {
    const porDefecto = () => Object.fromEntries(pares.map(([c, f]) => [c, f]));
    const eid = this.eid;
    if (eid === undefined) return porDefecto();
    try {
      const mapa = await this.configuracionService.obtenerMapa(eid);
      return Object.fromEntries(pares.map(([c, f]) => [c, mapa[c] ?? f]));
    } catch {
      return porDefecto();
    }
  }

  /**
   * Reporta a Sentry un fallo de generacion de asiento SIN romper el flujo que lo
   * invoca (patron TIPO B): un asiento contable es fire-and-forget por convencion,
   * la venta/compra/cobro/etc. ya ocurrio y no puede caerse por un problema contable.
   * Antes de este fix estos catches solo hacian logger.error() — invisibles fuera
   * de la consola del servidor.
   */
  private reportarFalloAsiento(
    err: unknown,
    operation: string,
    extra: Record<string, string> = {},
  ): void {
    reportServiceError(err, operation, { empresaId: String(this.eid ?? ''), ...extra });
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  // empresaId es REQUERIDO — un caller sin contexto de empresa debe pasar un
  // centinela imposible (this.eid ?? -1), nunca omitir el filtro. -1 nunca
  // matchea una empresa real, así que el lookup simplemente no encuentra
  // nada — cae en el camino de "cuenta no encontrada" que el único caller
  // (lineasDeCobroFactura) ya maneja con reportarFalloAsiento + respaldo a
  // Caja, en vez de silenciosamente devolver la cuenta de OTRA empresa.
  private async getCuenta(codigo: string, empresaId: number): Promise<CuentaContable | null> {
    return this.cuentaRepository.findOne({ where: { codigo, isActive: true, empresaId } });
  }

  private async generarNumero(empresaId?: number): Promise<string> {
    return generarNumeroSecuencial(
      this.dataSource,
      'asientos_contables',
      'numero',
      '^ASI-[0-9]+$',
      'ASI-',
      5,
      empresaId ?? 0,
    );
  }

  /**
   * Suma costoUnitario × cantidad de las líneas de la factura RESPALDADAS
   * POR UN PRODUCTO (factura_detalles."productoId" IS NOT NULL) — el
   * snapshot de AVCO que factura.service.ts ya toma al vender (ver
   * factura-detalle.entity.ts). Las líneas de servicio (sin productoId)
   * nunca cargan costo de inventario y no son un error: no participan del
   * cálculo, y una factura puramente de servicios devuelve null sin avisar
   * a nadie — no le falta nada.
   *
   * Si una línea CON producto trae costoUnitario = 0, es el caso real que
   * esto vigila: el producto nunca tuvo una compra recibida, así que AVCO
   * jamás calculó su costo. Generar el asiento igual sería mentir — se
   * vería contabilizado sin estarlo. Se reporta a Sentry (con los
   * productoId afectados) y se devuelve null para que el caller NO
   * contabilice ninguna línea de costo para esta factura completa, en vez
   * de un total parcial que nadie podría distinguir de uno correcto.
   */
  /**
   * FIX 3, COSTO DE VENTA COMMIT A (2026-09-20) — antes, UNA sola línea sin
   * costoUnitario descartaba el costo de venta de la factura COMPLETA
   * (aunque tuviera otras 10 líneas con costo real conocido). Con 5,332
   * productos hoy en costoPromedio=0 (nunca pasaron por una Compra
   * registrada — ver diagnóstico previo), eso significaba que la inmensa
   * mayoría de las facturas mixtas jamás contabilizaban NADA de costo de
   * venta, aunque la mayor parte de sus líneas sí tuvieran costo conocido.
   *
   * Ahora: se contabilizan las líneas CON costo; las líneas sin costo
   * quedan fuera del asiento (nunca se inventa un costo para ellas) y se
   * reportan a Sentry — el mismo aviso de antes, más el contador
   * `ventasSinHistorialCosto` que ya existe en getAnexoB1() para que el
   * contador vea el monto exacto que quedó afuera. El asiento sigue
   * cuadrando: DR Costo de Ventas y CR Inventario usan el MISMO total (el
   * de las líneas con costo), nunca el total de la factura completa.
   *
   * Si NINGUNA línea tiene costo, se mantiene el comportamiento de
   * siempre: no se contabiliza costo de venta (return null) — no hay nada
   * parcial que contabilizar.
   */
  private async resolverCostoVenta(facturaId: number, folio: string): Promise<number | null> {
    const filas = await this.dataSource.query<{ productoId: number | null; cantidad: string; costoUnitario: string }[]>(
      `SELECT "productoId", cantidad, "costoUnitario" FROM factura_detalles WHERE "facturaId" = $1`,
      [facturaId],
    );
    const conProducto = filas.filter(f => f.productoId != null);
    if (!conProducto.length) return null;

    const sinHistorial = conProducto.filter(f => Number(f.costoUnitario) === 0);
    if (sinHistorial.length > 0) {
      this.reportarFalloAsiento(
        new Error(
          `Factura ${folio}: ${sinHistorial.length} línea(s) con producto sin costoUnitario ` +
          `(nunca recibió una compra) — el costo de venta de esas líneas se omite; el resto de ` +
          `la factura SÍ contabiliza su costo real`,
        ),
        'asiento_costo_venta_sin_historial',
        {
          referenciaId:    String(facturaId),
          referenciaFolio: folio,
          productoIds:     sinHistorial.map(f => f.productoId).join(','),
        },
      );
    }

    const conHistorial = conProducto.filter(f => Number(f.costoUnitario) > 0);
    if (!conHistorial.length) return null; // ninguna línea con costo — nada que contabilizar, igual que siempre

    const total = conHistorial.reduce((s, f) => s + Number(f.costoUnitario) * Number(f.cantidad), 0);
    return total > 0 ? Number(total.toFixed(2)) : null;
  }

  /**
   * Resuelve las líneas de un asiento contra el catálogo (código → cuenta),
   * SIN persistir nada — la misma resolución y las mismas validaciones
   * (permiteMovimientos, partida doble) que antes vivían mezcladas con el
   * guardado. Extraído para el panel de vista previa (2026-09-19): calcular
   * un asiento sin guardarlo tiene que pasar por exactamente este código,
   * no por una réplica en el frontend ni por una copia paralela aquí.
   *
   * No reporta nada a Sentry por su cuenta — un caller que solo está
   * previsualizando (el usuario ni siquiera ha guardado el documento
   * todavía) no es un fallo operacional; el reporte sigue siendo
   * responsabilidad exclusiva de `_crearAsientoContabilizado()`, que sí
   * representa un intento real de persistir.
   */
  private async resolverLineasAsiento(
    lineas: LineaAsientoInput[],
    manager?: EntityManager,
  ): Promise<ResolverLineasResultado> {
    // Una sola query para todas las cuentas del asiento en vez de N findOne.
    // empresaId SIEMPRE va en el filtro — this.eid ?? -1: sin contexto de
    // empresa, -1 (ninguna empresa real) hace que `cuentas` salga vacío y
    // cada línea caiga en el "Cuenta contable X no encontrada" de abajo, el
    // mismo camino ya probado que usa _crearAsientoContabilizado() para
    // reportar y abortar sin romper el flujo del documento que lo disparó —
    // nunca se corre esta query sin filtro de empresa.
    if (this.eid === undefined) {
      this.logger.warn('resolverLineasAsiento: sin contexto de empresa — todas las cuentas se resuelven como no encontradas');
    }
    const codigos = [...new Set(lineas.map(l => l.codigo))];
    const whereCondition: any = { codigo: In(codigos), isActive: true, empresaId: this.eid ?? -1 };

    // Cuando el caller pasa un manager (transacción externa) lo usamos para que
    // la lectura de cuentas participe de la misma transacción.
    const cuentas = manager
      ? await manager.find(CuentaContable, { where: whereCondition })
      : await this.cuentaRepository.find({ where: whereCondition });

    const cuentaMap = new Map(cuentas.map(c => [c.codigo, c]));

    const lineasResueltas: { cuenta: CuentaContable; descripcion: string; debe: number; haber: number; manual?: boolean }[] = [];
    for (const l of lineas) {
      const cuenta = cuentaMap.get(l.codigo);
      if (!cuenta) {
        return {
          ok: false, tipo: 'asiento_cuenta_no_encontrada', codigoCuenta: l.codigo,
          mensaje: `Cuenta contable ${l.codigo} no encontrada — asiento omitido`,
        };
      }
      // P3 BLOQUE 2 — permiteMovimientos. El motor automático nunca leía
      // este flag y podía postear a una cuenta de agrupación (una que solo
      // existe para sumar sus hijas, ej. "6.1 Gastos Operacionales"), lo que
      // descuadra los subtotales del catálogo aunque el asiento en sí
      // cuadre en partida doble. Mismo criterio que el camino manual
      // (ContabilidadService.createAsiento()): si la cuenta no admite
      // movimientos directos, se descarta el asiento completo — no solo la
      // línea, porque un asiento con una línea faltante tampoco cuadraría.
      if (!cuenta.permiteMovimientos) {
        return {
          ok: false, tipo: 'asiento_cuenta_agrupacion', codigoCuenta: l.codigo, nombreCuenta: cuenta.nombre,
          mensaje: `Cuenta contable ${l.codigo} (${cuenta.nombre}) es de agrupación — asiento omitido`,
        };
      }
      lineasResueltas.push({ cuenta, ...l });
    }

    // Contabilidad — Balance/Diagnóstico (2026-09-20) — redondeo de centavos
    // (ITBIS calculado por línea vs. sobre el total, típicamente) se corrige
    // EN EL ORIGEN antes de persistir: nunca se deja un asiento con un
    // centavo de descuadre "tolerado" en los libros. Se ajusta la línea de
    // ITBIS si el asiento tiene una (el destino natural de un redondeo de
    // impuesto); si no, la línea de mayor monto — la que menos distorsiona
    // el saldo de esa cuenta en términos relativos. Solo se corrige a escala
    // de centavos (≤0.01): una diferencia mayor no es redondeo, es un bug
    // real en el builder de líneas, y forzar el cuadre lo escondería.
    const CODIGOS_ITBIS = new Set<string>([COD.ITBIS_POR_PAGAR, COD.ITBIS_CREDITO, COD.ITBIS_RET_POR_PAGAR]);
    const diferenciaRedondeo = Number(
      (lineasResueltas.reduce((s, l) => s + l.debe, 0) - lineasResueltas.reduce((s, l) => s + l.haber, 0)).toFixed(2),
    );
    if (diferenciaRedondeo !== 0 && Math.abs(diferenciaRedondeo) <= 0.01) {
      const candidata =
        lineasResueltas.find(l => CODIGOS_ITBIS.has(l.cuenta.codigo)) ??
        lineasResueltas.reduce((mayor, l) => (Math.max(l.debe, l.haber) > Math.max(mayor.debe, mayor.haber) ? l : mayor));
      if (candidata.haber > 0) {
        candidata.haber = Number((candidata.haber + diferenciaRedondeo).toFixed(2));
      } else {
        candidata.debe = Number((candidata.debe - diferenciaRedondeo).toFixed(2));
      }
    }

    const totalDebe  = lineasResueltas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = lineasResueltas.reduce((s, l) => s + l.haber, 0);

    // P3 BLOQUE 1 — partida doble. El camino manual (contabilidad.service.ts
    // createAsiento()) valida esto con el mismo umbral antes de persistir;
    // este motor automático corre en el 100% de las operaciones (facturas,
    // compras, cobros, pagos, nómina, reversas...) — un builder de líneas
    // con un bug podía postear un asiento descuadrado sin que nadie se
    // enterara hasta el cierre. Un asiento descuadrado en los libros es peor
    // que ninguno. Llegar aquí con una diferencia > 0.01 significa que la
    // corrección de redondeo de arriba no aplicó (o no alcanzó) — es un
    // descuadre real, se rechaza.
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return {
        ok: false, tipo: 'asiento_descuadrado', totalDebe, totalHaber,
        mensaje: `Asiento descuadrado: Debe ${totalDebe.toFixed(2)} vs Haber ${totalHaber.toFixed(2)} ` +
          `(diferencia ${(totalDebe - totalHaber).toFixed(2)})`,
      };
    }

    return { ok: true, lineasResueltas, totalDebe, totalHaber };
  }

  /**
   * Vista previa de un asiento — misma resolución/validación que
   * `_crearAsientoContabilizado()`, sin persistir nada. Usada por los
   * métodos `previsualizarXxx()` de cada documento (gastos, compras, etc.)
   * después de armar sus líneas con la MISMA lógica que su método
   * `asientoXxx()` real — nunca una réplica en el frontend.
   */
  private async previsualizarLineas(lineas: LineaAsientoInput[]): Promise<PreviewAsientoResultado> {
    const resultado = await this.resolverLineasAsiento(lineas);
    if (!resultado.ok) {
      return {
        ok: false,
        lineas: lineas.map(l => ({ codigo: l.codigo, nombre: '', debe: l.debe, haber: l.haber })),
        totalDebe:  +lineas.reduce((s, l) => s + l.debe,  0).toFixed(2),
        totalHaber: +lineas.reduce((s, l) => s + l.haber, 0).toFixed(2),
        cuadrado:   false,
        error:      resultado.mensaje,
      };
    }
    return {
      ok: true,
      lineas: resultado.lineasResueltas.map(l => ({ codigo: l.cuenta.codigo, nombre: l.cuenta.nombre, debe: l.debe, haber: l.haber })),
      totalDebe:  +resultado.totalDebe.toFixed(2),
      totalHaber: +resultado.totalHaber.toFixed(2),
      cuadrado:   true,
    };
  }

  private async _crearAsientoContabilizado(
    params: {
      descripcion:     string;
      tipoOrigen:      TipoOrigenAsiento;
      referenciaId:    number;
      referenciaFolio: string;
      // P3 BLOQUE 3 — fecha del documento origen, NUNCA new Date() ni
      // .toISOString(). String 'YYYY-MM-DD' (o 'YYYY-MM-DDTHH:mm:ssZ', la
      // columna es `type: 'date'` y trunca la hora igual). Requerido a
      // propósito: antes de este bloque esta función siempre usaba
      // new Date() del servidor (UTC), así que una venta de las 8pm en RD
      // se asentaba con fecha del día siguiente — eso corre las ventas de
      // fin de mes al mes siguiente en los reportes fiscales. Hacerlo
      // requerido (no opcional con fallback a fechaHoyRD()) obliga a que
      // cada uno de los ~20 callers piense de dónde sale su fecha, en vez
      // de heredar en silencio la del servidor.
      fecha:           string;
      userId:          number;
      lineas: LineaAsientoInput[];
    },
    manager?: EntityManager,
  ): Promise<AsientoContable | null> {
    // Nunca persistir un asiento sin empresaId — antes, sin contexto de
    // empresa, `...(this.eid ? {empresaId: this.eid} : {})` creaba la fila
    // igual, con empresaId ausente: un asiento huérfano, invisible a
    // cualquier consulta normal (todas filtran por empresaId), pero real en
    // los libros. Se corta aquí, ANTES de resolver líneas ni tocar la BD,
    // con el mismo patrón de reporte que cualquier otro fallo de este motor
    // — nunca rompe el flujo del documento que lo disparó.
    const eid = this.eid;
    if (eid === undefined) {
      this.logger.error(
        `Asiento ${params.tipoOrigen} ref=${params.referenciaId} (${params.referenciaFolio}) ` +
        `SIN CONTEXTO DE EMPRESA — no se persiste.`,
      );
      this.reportarFalloAsiento(
        new Error('Sin contexto de empresa — asiento omitido'),
        'asiento_sin_contexto_empresa',
        { tipoOrigen: params.tipoOrigen, referenciaId: String(params.referenciaId), referenciaFolio: params.referenciaFolio },
      );
      return null;
    }

    const resultado = await this.resolverLineasAsiento(params.lineas, manager);

    if (!resultado.ok) {
      if (resultado.tipo === 'asiento_descuadrado') {
        this.logger.error(
          `Asiento ${params.tipoOrigen} ref=${params.referenciaId} (${params.referenciaFolio}) ` +
          `DESCUADRADO — NO se persiste. Debe=${resultado.totalDebe.toFixed(2)} Haber=${resultado.totalHaber.toFixed(2)}`,
        );
        this.reportarFalloAsiento(new Error(resultado.mensaje), 'asiento_descuadrado', {
          tipoOrigen:      params.tipoOrigen,
          referenciaId:    String(params.referenciaId),
          referenciaFolio: params.referenciaFolio,
          descripcion:     params.descripcion,
          lineas:          JSON.stringify(params.lineas),
        });
        return null;
      }

      // asiento_cuenta_no_encontrada / asiento_cuenta_agrupacion
      const detalleLog = resultado.tipo === 'asiento_cuenta_agrupacion'
        ? `Cuenta ${resultado.codigoCuenta} (${resultado.nombreCuenta}) no permite movimientos directos — asiento omitido`
        : `Cuenta ${resultado.codigoCuenta} no encontrada — asiento omitido`;
      this.logger.warn(detalleLog);
      // Reportado aqui mismo (no en cada uno de los ~20 callers) para que ninguno
      // pueda omitirlo: falta una cuenta en el catalogo de la empresa y el
      // documento origen (factura, compra, cobro...) se procesa igual sin asiento.
      this.reportarFalloAsiento(new Error(resultado.mensaje), resultado.tipo, {
        tipoOrigen:      params.tipoOrigen,
        referenciaId:    String(params.referenciaId),
        referenciaFolio: params.referenciaFolio,
        codigoCuenta:    resultado.codigoCuenta,
      });
      return null;
    }

    const { lineasResueltas, totalDebe, totalHaber } = resultado;

    // NOTA: generarNumero() usa this.dataSource.query() — una conexión del pool
    // FUERA de la transacción externa (si la hay). La función siguiente_numero_secuencia
    // hace INSERT ... ON CONFLICT DO UPDATE que se confirma inmediatamente.
    // Consecuencia aceptada: si la tx externa hace rollback, el número ASI-XXXX queda
    // consumido y habrá un hueco en la numeración. La unicidad es invariante; la densidad
    // no es requerimiento (un auditor puede ver el hueco pero no habrá duplicados).
    const numero = await this.generarNumero(eid);

    const asientoData = {
      empresaId:       eid,
      numero,
      fecha:           params.fecha as unknown as Date, // string 'YYYY-MM-DD' crudo del caller, nunca new Date(string)
      descripcion:     params.descripcion,
      tipoOrigen:      params.tipoOrigen,
      referenciaId:    params.referenciaId,
      referenciaFolio: params.referenciaFolio,
      estado:          EstadoAsiento.CONTABILIZADO,
      totalDebe:       Number(totalDebe.toFixed(2)),
      totalHaber:      Number(totalHaber.toFixed(2)),
      userId:          params.userId,
    };

    const asientoInstance = this.asientoRepository.create(asientoData);
    const asiento = manager
      ? await manager.save(AsientoContable, asientoInstance)
      : await this.asientoRepository.save(asientoInstance);

    const lineasData = lineasResueltas.map((l) => ({
      asientoId:        asiento.id,
      cuentaContableId: l.cuenta.id,
      descripcion:      l.descripcion,
      debe:             l.debe,
      haber:            l.haber,
      cuentaManual:     l.manual ?? undefined,
    }));

    const lineasInstances = this.lineaRepository.create(lineasData);
    if (manager) {
      await manager.save(AsientoLinea, lineasInstances);
    } else {
      await this.lineaRepository.save(lineasInstances);
    }

    return asiento;
  }

  // ──────────────────────────────────────────────────────────────────
  // Factura emitida → Clientes / Ventas / ITBIS por Pagar
  // ──────────────────────────────────────────────────────────────────

  async asientoFacturaEmitida(
    facturaId: number,
    total: number,
    subtotal: number,
    iva: number,
    folio: string,
    fecha: string, // factura.fecha — nunca new Date() del servidor, ver _crearAsientoContabilizado
    userId: number,
    retenciones?: { retItbis?: number; retIsr?: number; netoCobrar?: number },
    pago?: { tipoPago: 'CONTADO' | 'CREDITO'; formasPago?: { tipo: number; monto: number }[] },
  ): Promise<void> {
    const retItbis   = retenciones?.retItbis   ?? 0;
    const retIsr     = retenciones?.retIsr     ?? 0;
    const neto       = retenciones?.netoCobrar ?? total;

    // Configuración Contable por Módulo (2026-09-19) — Ventas es de solo
    // lectura por documento (no hay selector: "la contabilización es única y
    // correcta, no es materia de opinión"), pero SÍ es configurable una vez
    // por empresa. Una sola resolución para todo el grupo — CLIENTES y CAJA
    // se resuelven aquí también (no dentro de lineasDeCobroFactura) para que
    // solo haya UNA llamada a obtenerMapa() por asiento, igual que siempre.
    const cuentas = await this.resolverCuentasConcepto([
      ['CLIENTES',              COD.CLIENTES],
      ['CAJA',                  COD.CAJA],
      ['VENTAS',                COD.VENTAS],
      ['ITBIS_POR_PAGAR',       COD.ITBIS_POR_PAGAR],
      ['RETENCION_ITBIS_VENTA', '1.1.4.02'],
      ['RETENCION_ISR_VENTA',   '1.1.4.03'],
      ['COSTO_VENTAS',          COD.COSTO_VENTAS],
      ['INVENTARIO',            COD.INVENTARIO],
    ]);

    // DR: Clientes (crédito) y/o Caja/Bancos (contado) — ver lineasDeCobroFactura()
    // DR: ITBIS Retenido a Recuperar (si aplica) — activo corriente
    // DR: ISR Retenido a Recuperar (si aplica)   — activo corriente
    // CR: Ventas (subtotal)
    // CR: ITBIS por Pagar (iva total)
    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      ...(await this.lineasDeCobroFactura(neto, folio, pago, cuentas.CLIENTES, cuentas.CAJA)),
      { codigo: cuentas.VENTAS,          descripcion: `Ingreso por venta ${folio}`, debe: 0,     haber: subtotal },
      { codigo: cuentas.ITBIS_POR_PAGAR, descripcion: `ITBIS débito fiscal ${folio}`, debe: 0,  haber: iva },
    ];
    if (retItbis > 0) {
      lineas.push({ codigo: cuentas.RETENCION_ITBIS_VENTA, descripcion: `ITBIS retenido a recuperar ${folio}`, debe: retItbis, haber: 0 });
    }
    if (retIsr > 0) {
      lineas.push({ codigo: cuentas.RETENCION_ISR_VENTA, descripcion: `ISR retenido a recuperar ${folio}`, debe: retIsr, haber: 0 });
    }

    try {
      // DR: Costo de Ventas / CR: Inventario, por costoUnitario × cantidad de
      // las líneas con producto (AVCO). Dentro del try: si la query falla,
      // debe reportarse igual que cualquier otro fallo de este asiento, no
      // tumbar la emisión de la factura (fire-and-forget, ver spec de este
      // archivo). Un producto sin costo se ve peor contabilizado que sin
      // asiento — resolverCostoVenta() devuelve null y reporta a Sentry en
      // vez de dejar pasar un DR/CR en $0.
      const costoVenta = await this.resolverCostoVenta(facturaId, folio);
      if (costoVenta) {
        lineas.push({ codigo: cuentas.COSTO_VENTAS, descripcion: `Costo de venta ${folio}`, debe: costoVenta, haber: 0 });
        lineas.push({ codigo: cuentas.INVENTARIO,   descripcion: `Salida de inventario ${folio}`, debe: 0, haber: costoVenta });
      }

      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Venta según factura ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.FACTURA,
        referenciaId:    facturaId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento factura ${folio} generado`);
      } else {
        this.logger.warn(`Asiento factura ${folio} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento factura ${folio}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_factura_emitida', {
        tipoOrigen: TipoOrigenAsiento.FACTURA, referenciaId: String(facturaId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Compra recibida → Inventario / ITBIS Crédito / Proveedores
  // ──────────────────────────────────────────────────────────────────

  /**
   * Líneas del asiento de una compra recibida — extraído a su propia
   * función (2026-09-19, panel de vista previa) para que
   * `asientoCompraRecibida()` (persiste) y `previsualizarCompra()` (no
   * persiste) arranquen del mismo cálculo. `cuentaDestino` reemplaza el
   * default `COD.INVENTARIO` — la misma compra puede ser gasto, activo fijo
   * o inventario según lo que realmente se compró.
   */
  private construirLineasCompra(
    total: number, subtotal: number, itbis: number, folio: string,
    retenciones: { montoItbis?: number; montoIsr?: number; netoPagar?: number } | undefined,
    cuentaDestino: string, cuentaDestinoManual: boolean,
    cuentas: { itbisCredito: string; proveedores: string; itbisRet: string; isrRet: string },
  ): LineaAsientoInput[] {
    const retenItbis = retenciones?.montoItbis ?? 0;
    const retenIsr   = retenciones?.montoIsr   ?? 0;
    const neto       = retenciones?.netoPagar  ?? total;
    // ITBIS que queda como crédito fiscal = ITBIS facturado - ITBIS retenido
    const itbisCredito = Number((itbis - retenItbis).toFixed(2));

    const lineas: LineaAsientoInput[] = [
      { codigo: cuentaDestino,          descripcion: `Mercancía recibida ${folio}`, debe: subtotal, haber: 0, manual: cuentaDestinoManual },
      { codigo: cuentas.itbisCredito,   descripcion: `ITBIS crédito fiscal ${folio}`, debe: itbisCredito > 0 ? itbisCredito : itbis, haber: 0 },
      { codigo: cuentas.proveedores,    descripcion: `CxP proveedor ${folio}`,      debe: 0,       haber: neto },
    ];
    if (retenItbis > 0) {
      lineas.push({ codigo: cuentas.itbisRet, descripcion: `ITBIS retenido E41 ${folio}`, debe: 0, haber: retenItbis });
    }
    if (retenIsr > 0) {
      lineas.push({ codigo: cuentas.isrRet, descripcion: `ISR retenido E41 ${folio}`, debe: 0, haber: retenIsr });
    }
    return lineas;
  }

  // Configuración Contable por Módulo — un solo lookup para todo el grupo
  // Compras (Inventario/default de cuentaDestino, ITBIS Crédito,
  // Proveedores, retenciones E41).
  private async resolverCuentasCompra() {
    return this.resolverCuentasConcepto([
      ['INVENTARIO',          COD.INVENTARIO],
      ['ITBIS_CREDITO',       COD.ITBIS_CREDITO],
      ['PROVEEDORES',         COD.PROVEEDORES],
      ['ITBIS_RET_POR_PAGAR', COD.ITBIS_RET_POR_PAGAR],
      ['ISR_RET_POR_PAGAR',   COD.ISR_RET_POR_PAGAR],
    ]);
  }

  /**
   * Vista previa del asiento de una compra recibida, sin persistir nada —
   * mismas líneas que `asientoCompraRecibida()` generaría. El formulario de
   * Compras la llama antes de guardar/recibir para mostrar el panel.
   */
  async previsualizarCompra(
    total: number, subtotal: number, itbis: number, folio: string,
    retenciones?: { montoItbis?: number; montoIsr?: number; netoPagar?: number },
    cuentaDestino?: string,
  ): Promise<PreviewAsientoResultado> {
    const cuentas = await this.resolverCuentasCompra();
    return this.previsualizarLineas(
      this.construirLineasCompra(total, subtotal, itbis, folio, retenciones, cuentaDestino || cuentas.INVENTARIO, false, {
        itbisCredito: cuentas.ITBIS_CREDITO, proveedores: cuentas.PROVEEDORES,
        itbisRet: cuentas.ITBIS_RET_POR_PAGAR, isrRet: cuentas.ISR_RET_POR_PAGAR,
      }),
    );
  }

  async asientoCompraRecibida(
    compraId: number,
    total: number,
    subtotal: number,
    itbis: number,
    folio: string,
    fecha: string, // compra.fecha
    userId: number,
    retenciones?: { montoItbis?: number; montoIsr?: number; netoPagar?: number },
    cuentaDestino?: string,
    cuentaDestinoManual = false,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasCompra();
    const lineas = this.construirLineasCompra(total, subtotal, itbis, folio, retenciones, cuentaDestino || cuentas.INVENTARIO, cuentaDestinoManual, {
      itbisCredito: cuentas.ITBIS_CREDITO, proveedores: cuentas.PROVEEDORES,
      itbisRet: cuentas.ITBIS_RET_POR_PAGAR, isrRet: cuentas.ISR_RET_POR_PAGAR,
    });

    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Compra según orden ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.COMPRA,
        referenciaId:    compraId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento compra ${folio} generado`);
      } else {
        this.logger.warn(`Asiento compra ${folio} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento compra ${folio}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_compra_recibida', {
        tipoOrigen: TipoOrigenAsiento.COMPRA, referenciaId: String(compraId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Cobro recibido (CxC) → Bancos / Clientes
  // ──────────────────────────────────────────────────────────────────

  // referenciaId es el id del PAGO (pagos_cobrados), no el de la CxC: dos
  // abonos sobre la misma cuenta generan dos asientos distintos, y
  // revertirAsiento() necesita poder apuntar a uno solo sin ambigüedad.
  // cxcId es solo para la descripción/legibilidad del asiento.
  // PURO: sin BD — la contrapartida por default es Bancos, pero un cobro
  // puede liquidarse contra otra cuenta (p. ej. una compensación) — el
  // selector del formulario de CxC lo permite elegir; el default queda
  // siempre puesto.
  private construirLineasCobro(
    monto: number, pagoId: number, cxcId: number,
    cuentaContrapartida: string, cuentaContrapartidaManual: boolean, cuentaClientes: string,
  ): LineaAsientoInput[] {
    return [
      { codigo: cuentaContrapartida, descripcion: `Cobro recibido CxC #${cxcId} — pago #${pagoId}`, debe: monto, haber: 0, manual: cuentaContrapartidaManual },
      { codigo: cuentaClientes,      descripcion: `Cancelación CxC #${cxcId} — pago #${pagoId}`,    debe: 0,     haber: monto },
    ];
  }

  /** Panel de vista previa: calcula el asiento de cobro SIN guardar el pago. */
  async previsualizarCobro(
    monto: number, pagoId: number, cxcId: number, cuentaContrapartida?: string,
  ): Promise<PreviewAsientoResultado> {
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], ['CLIENTES', COD.CLIENTES]]);
    return this.previsualizarLineas(this.construirLineasCobro(monto, pagoId, cxcId, cuentaContrapartida || cuentas.BANCOS, false, cuentas.CLIENTES));
  }

  async asientoCobro(
    monto: number,
    pagoId: number,
    cxcId: number,
    fecha: string, // fecha del pago (dto.fechaPago del caller, con fallback a fechaHoyRD() si no vino)
    userId: number,
    cuentaContrapartida?: string,
    cuentaContrapartidaManual = false,
  ): Promise<void> {
    const folio = `PAGO-${pagoId}`;
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], ['CLIENTES', COD.CLIENTES]]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Cobro CxC #${cxcId} — pago #${pagoId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    pagoId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas: this.construirLineasCobro(monto, pagoId, cxcId, cuentaContrapartida || cuentas.BANCOS, cuentaContrapartidaManual, cuentas.CLIENTES),
      });
      if (asiento) {
        this.logger.log(`Asiento cobro CxC #${cxcId} — pago #${pagoId} generado`);
      } else {
        this.logger.warn(`Asiento cobro CxC #${cxcId} — pago #${pagoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento cobro CxC #${cxcId} — pago #${pagoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_cobro', {
        tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: String(pagoId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Cobro CxC en moneda extranjera con diferencia cambiaria
  // DÉBITO BANCOS     = montoME * tasaHoy (DOP reales recibidos)
  // CRÉDITO CLIENTES  = montoME * tasaOrig (DOP registrados al crear CxC)
  // Diferencia → GANANCIA_CAMBIARIA o PÉRDIDA_CAMBIARIA
  // ──────────────────────────────────────────────────────────────────

  // Ver nota de asientoCobro: referenciaId es el id del pago, no el de la CxC.
  async asientoCobroME(
    montoME:  number,
    moneda:   string,
    tasaHoy:  number,
    tasaOrig: number,
    pagoId:   number,
    cxcId:    number,
    fecha:    string, // fecha del pago
    userId:   number,
  ): Promise<void> {
    const montoReal = parseFloat((montoME * tasaHoy).toFixed(2));
    const montoLib  = parseFloat((montoME * tasaOrig).toFixed(2));
    const diff      = parseFloat((montoReal - montoLib).toFixed(2));
    const folio     = `PAGO-${pagoId}`;

    const cuentas = await this.resolverCuentasConcepto([
      ['BANCOS',              COD.BANCOS],
      ['CLIENTES',            COD.CLIENTES],
      ['GANANCIA_CAMBIARIA',  COD.GANANCIA_CAMBIARIA],
      ['PERDIDA_CAMBIARIA',   COD.PERDIDA_CAMBIARIA],
    ]);
    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: cuentas.BANCOS,   descripcion: `Cobro ${moneda} CxC #${cxcId} — pago #${pagoId}`, debe: montoReal, haber: 0        },
      { codigo: cuentas.CLIENTES, descripcion: `Cancelación CxC #${cxcId} — pago #${pagoId}`,       debe: 0,         haber: montoLib },
    ];

    if (diff > 0.005) {
      lineas.push({ codigo: cuentas.GANANCIA_CAMBIARIA, descripcion: `Ganancia cambiaria CxC #${cxcId} (${moneda}) — pago #${pagoId}`, debe: 0,    haber: diff });
    } else if (diff < -0.005) {
      lineas.push({ codigo: cuentas.PERDIDA_CAMBIARIA,  descripcion: `Pérdida cambiaria CxC #${cxcId} (${moneda}) — pago #${pagoId}`,  debe: -diff, haber: 0   });
    }

    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Cobro ${moneda} CxC #${cxcId} — pago #${pagoId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    pagoId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento cobro ME CxC #${cxcId} — pago #${pagoId} — diff cambiaria: ${diff} RD$`);
      } else {
        this.logger.warn(`Asiento cobro ME CxC #${cxcId} — pago #${pagoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento cobro ME CxC #${cxcId} — pago #${pagoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_cobro_me', {
        tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: String(pagoId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Pago CxP en moneda extranjera con diferencia cambiaria
  // CRÉDITO BANCOS    = montoME * tasaHoy (DOP reales pagados)
  // DÉBITO PROVEEDORES = montoME * tasaOrig (DOP en libros al crear CxP)
  // Diferencia → GANANCIA_CAMBIARIA o PÉRDIDA_CAMBIARIA
  // ──────────────────────────────────────────────────────────────────

  // Ver nota de asientoCobro: referenciaId es el id del pago, no el de la CxP.
  async asientoPagoME(
    montoME:  number,
    moneda:   string,
    tasaHoy:  number,
    tasaOrig: number,
    pagoId:   number,
    cxpId:    number,
    fecha:    string, // fecha del pago
    userId:   number,
  ): Promise<void> {
    const montoReal = parseFloat((montoME * tasaHoy).toFixed(2));
    const montoLib  = parseFloat((montoME * tasaOrig).toFixed(2));
    const diff      = parseFloat((montoLib - montoReal).toFixed(2)); // positivo = ganancia (pagamos menos DOP)
    const folio     = `PAGOCXP-${pagoId}`;

    const cuentas = await this.resolverCuentasConcepto([
      ['PROVEEDORES',        COD.PROVEEDORES],
      ['BANCOS',             COD.BANCOS],
      ['GANANCIA_CAMBIARIA', COD.GANANCIA_CAMBIARIA],
      ['PERDIDA_CAMBIARIA',  COD.PERDIDA_CAMBIARIA],
    ]);
    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: cuentas.PROVEEDORES, descripcion: `Cancelación CxP #${cxpId} — pago #${pagoId}`,    debe: montoLib,  haber: 0        },
      { codigo: cuentas.BANCOS,      descripcion: `Pago ${moneda} CxP #${cxpId} — pago #${pagoId}`, debe: 0,         haber: montoReal },
    ];

    if (diff > 0.005) {
      lineas.push({ codigo: cuentas.GANANCIA_CAMBIARIA, descripcion: `Ganancia cambiaria CxP #${cxpId} (${moneda}) — pago #${pagoId}`, debe: 0,    haber: diff });
    } else if (diff < -0.005) {
      lineas.push({ codigo: cuentas.PERDIDA_CAMBIARIA,  descripcion: `Pérdida cambiaria CxP #${cxpId} (${moneda}) — pago #${pagoId}`,  debe: -diff, haber: 0   });
    }

    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Pago ${moneda} CxP #${cxpId} — pago #${pagoId}`,
        tipoOrigen:      TipoOrigenAsiento.PAGO,
        referenciaId:    pagoId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento pago ME CxP #${cxpId} — pago #${pagoId} — diff cambiaria: ${diff} RD$`);
      } else {
        this.logger.warn(`Asiento pago ME CxP #${cxpId} — pago #${pagoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento pago ME CxP #${cxpId} — pago #${pagoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_pago_me', {
        tipoOrigen: TipoOrigenAsiento.PAGO, referenciaId: String(pagoId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Recibo de cobro sin CxC → Caja/Banco / Clientes
  // Para efectivo: DÉBITO Caja. Para el resto: DÉBITO Bancos.
  // ──────────────────────────────────────────────────────────────────

  async asientoRecibo(
    monto:     number,
    reciboId:  number,
    metodoPago: string,
    fecha:     string, // recibo.fecha
    userId:    number,
  ): Promise<void> {
    const cuentaDebito = await this.resolverCuentaPorMetodoPago(metodoPago);
    const cuentaClientes = await this.resolverCuentaConcepto('CLIENTES', COD.CLIENTES);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Recibo de cobro #${reciboId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    reciboId,
        referenciaFolio: `REC-${reciboId}`,
        fecha,
        userId,
        lineas: [
          { codigo: cuentaDebito,   descripcion: `Ingreso recibo #${reciboId}`, debe: monto, haber: 0    },
          { codigo: cuentaClientes, descripcion: `Cobro recibido REC-${reciboId}`, debe: 0,  haber: monto },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento recibo de cobro #${reciboId} generado`);
      } else {
        this.logger.warn(`Asiento recibo de cobro #${reciboId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento recibo #${reciboId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_recibo', {
        tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: String(reciboId), referenciaFolio: `REC-${reciboId}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Pago realizado (CxP) → Proveedores / Bancos
  // ──────────────────────────────────────────────────────────────────

  // Ver nota de asientoCobro: referenciaId es el id del pago, no el de la CxP.
  // PURO: sin BD — misma idea que construirLineasCobro, para la contrapartida
  // del pago (por default Bancos).
  private construirLineasPago(
    monto: number, pagoId: number, cxpId: number,
    cuentaContrapartida: string, cuentaContrapartidaManual: boolean, cuentaProveedores: string,
  ): LineaAsientoInput[] {
    return [
      { codigo: cuentaProveedores,   descripcion: `Cancelación CxP #${cxpId} — pago #${pagoId}`,    debe: monto, haber: 0 },
      { codigo: cuentaContrapartida, descripcion: `Pago realizado CxP #${cxpId} — pago #${pagoId}`, debe: 0,     haber: monto, manual: cuentaContrapartidaManual },
    ];
  }

  /** Panel de vista previa: calcula el asiento de pago SIN guardar el pago. */
  async previsualizarPago(
    monto: number, pagoId: number, cxpId: number, cuentaContrapartida?: string,
  ): Promise<PreviewAsientoResultado> {
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], ['PROVEEDORES', COD.PROVEEDORES]]);
    return this.previsualizarLineas(this.construirLineasPago(monto, pagoId, cxpId, cuentaContrapartida || cuentas.BANCOS, false, cuentas.PROVEEDORES));
  }

  async asientoPago(
    monto: number,
    pagoId: number,
    cxpId: number,
    fecha: string, // fecha del pago
    userId: number,
    cuentaContrapartida?: string,
    cuentaContrapartidaManual = false,
  ): Promise<void> {
    const folio = `PAGOCXP-${pagoId}`;
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], ['PROVEEDORES', COD.PROVEEDORES]]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Pago CxP #${cxpId} — pago #${pagoId}`,
        tipoOrigen:      TipoOrigenAsiento.PAGO,
        referenciaId:    pagoId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas: this.construirLineasPago(monto, pagoId, cxpId, cuentaContrapartida || cuentas.BANCOS, cuentaContrapartidaManual, cuentas.PROVEEDORES),
      });
      if (asiento) {
        this.logger.log(`Asiento pago CxP #${cxpId} — pago #${pagoId} generado`);
      } else {
        this.logger.warn(`Asiento pago CxP #${cxpId} — pago #${pagoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento pago CxP #${cxpId} — pago #${pagoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_pago', {
        tipoOrigen: TipoOrigenAsiento.PAGO, referenciaId: String(pagoId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Nómina pagada → Sueldos / TSS Patronal / Sueldos x Pagar / TSS x Pagar / ISR
  // ──────────────────────────────────────────────────────────────────

  async asientoNomina(
    periodoId: number,
    totalBruto: number,
    totalNeto: number,
    totalTSSEmpleados: number,
    totalISR: number,
    totalTSSPatronal: number,
    periodo: string,
    fechaPago: string, // periodo.fechaPago — "periodo" arriba es la etiqueta ('Septiembre 2026'), no una fecha
    userId: number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['SUELDOS',         COD.SUELDOS],
      ['TSS_PATRONAL',    COD.TSS_PATRONAL],
      ['SUELDOS_X_PAGAR', COD.SUELDOS_X_PAGAR],
      ['TSS_X_PAGAR',     COD.TSS_X_PAGAR],
      ['ISR_X_PAGAR',     COD.ISR_X_PAGAR],
    ]);
    try {
      const costoTotal = totalBruto + totalTSSPatronal;
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Nómina ${periodo}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    periodoId,
        referenciaFolio: `NOM-${periodo}`,
        fecha:           fechaPago,
        userId,
        lineas: [
          { codigo: cuentas.SUELDOS,         descripcion: `Sueldos nómina ${periodo}`,        debe: totalBruto,      haber: 0 },
          { codigo: cuentas.TSS_PATRONAL,    descripcion: `TSS patronal nómina ${periodo}`,   debe: totalTSSPatronal, haber: 0 },
          { codigo: cuentas.SUELDOS_X_PAGAR, descripcion: `Neto a pagar nómina ${periodo}`,   debe: 0,               haber: totalNeto },
          { codigo: cuentas.TSS_X_PAGAR,     descripcion: `TSS empleados nómina ${periodo}`,  debe: 0,               haber: totalTSSEmpleados + totalTSSPatronal },
          { codigo: cuentas.ISR_X_PAGAR,     descripcion: `ISR retenido nómina ${periodo}`,   debe: 0,               haber: totalISR },
        ].filter((l) => l.debe > 0 || l.haber > 0),
      });
      if (asiento) {
        this.logger.log(`Asiento nómina ${periodo} generado. Costo total: ${costoTotal.toFixed(2)}`);
      } else {
        this.logger.warn(`Asiento nómina ${periodo} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento nómina ${periodo}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_nomina', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(periodoId), referenciaFolio: `NOM-${periodo}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Depósito/retiro bancario MANUAL (Tesorería, 2026-09-19) → Bancos (D o H,
  // según sea depósito o retiro) / contrapartida (H o D) elegida por el
  // selector del formulario. Antes de esta pieza, un movimiento manual en
  // Tesorería (sin CxC/CxP de por medio — un aporte de capital, un cargo
  // bancario, etc.) quedaba en movimientos_bancarios sin llegar NUNCA al
  // mayor contable: dos sistemas de contabilidad en paralelo que podían
  // divergir sin que nadie lo notara.
  //
  // Una transferencia entre 2 cuentas bancarias PROPIAS no genera asiento
  // aquí — ver TesoreriaService.registrarTransferencia(): ambos lados serían
  // la misma cuenta contable "Bancos", sin efecto neto en el mayor. El
  // detalle de qué banco físico se movió lo sigue Tesorería, no este motor.
  // ──────────────────────────────────────────────────────────────────

  private construirLineasMovimientoBancario(
    monto: number, descripcion: string, esDeposito: boolean,
    cuentaContrapartida: string, cuentaContrapartidaManual: boolean, cuentaBancos: string,
  ): LineaAsientoInput[] {
    return esDeposito
      ? [
          { codigo: cuentaBancos,       descripcion, debe: monto, haber: 0 },
          { codigo: cuentaContrapartida, descripcion, debe: 0,     haber: monto, manual: cuentaContrapartidaManual },
        ]
      : [
          { codigo: cuentaContrapartida, descripcion, debe: monto, haber: 0, manual: cuentaContrapartidaManual },
          { codigo: cuentaBancos,       descripcion, debe: 0,     haber: monto },
        ];
  }

  /** Panel de vista previa: calcula el asiento de depósito/retiro bancario SIN registrar nada. */
  async previsualizarMovimientoBancario(
    monto: number, descripcion: string, esDeposito: boolean, cuentaContrapartida?: string,
  ): Promise<PreviewAsientoResultado> {
    const conceptoDefault = esDeposito ? 'DEPOSITO_OTRO_INGRESO' : 'RETIRO_OTRO_GASTO';
    const defaultLiteral   = esDeposito ? '4.2.1.02' : '6.1.2.09';
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], [conceptoDefault, defaultLiteral]]);
    return this.previsualizarLineas(this.construirLineasMovimientoBancario(
      monto, descripcion, esDeposito, cuentaContrapartida || cuentas[conceptoDefault], false, cuentas.BANCOS,
    ));
  }

  async asientoMovimientoBancario(
    movimientoId: number, monto: number, descripcion: string, esDeposito: boolean,
    fecha: string, userId: number, cuentaContrapartida?: string, cuentaContrapartidaManual = false,
  ): Promise<void> {
    if (monto <= 0) return;
    const conceptoDefault = esDeposito ? 'DEPOSITO_OTRO_INGRESO' : 'RETIRO_OTRO_GASTO';
    const defaultLiteral   = esDeposito ? '4.2.1.02' : '6.1.2.09';
    const cuentas = await this.resolverCuentasConcepto([['BANCOS', COD.BANCOS], [conceptoDefault, defaultLiteral]]);
    const lineas = this.construirLineasMovimientoBancario(
      monto, descripcion, esDeposito, cuentaContrapartida || cuentas[conceptoDefault], cuentaContrapartidaManual, cuentas.BANCOS,
    );
    const folio = `${esDeposito ? 'DEP' : 'RET'}-${movimientoId}`;
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    movimientoId,
        referenciaFolio: folio,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento ${esDeposito ? 'depósito' : 'retiro'} bancario ${folio} generado`);
      } else {
        this.logger.warn(`Asiento ${esDeposito ? 'depósito' : 'retiro'} bancario ${folio} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento movimiento bancario ${folio}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_movimiento_bancario', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(movimientoId), referenciaFolio: folio,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Venta de Restaurante (2026-09-19) → Caja/Bancos (D) / Ventas + ITBIS (H)
  // Antes de esta pieza, restaurante.service.ts armaba este asiento con SQL
  // crudo directo a asientos_contables/asiento_lineas — sin pasar por este
  // motor: sin validación de partida doble, sin reporte a Sentry si faltaba
  // una cuenta, con las 3 cuentas hardcodeadas, y con userId fijo en 1 en vez
  // del usuario real que cobró. La factura de esa venta nace EMITIDA por
  // INSERT crudo (no pasa por facturas.cambiarEstado()), así que este es el
  // ÚNICO asiento de esa venta — no hay riesgo de duplicarlo con
  // asientoFacturaEmitida.
  // ──────────────────────────────────────────────────────────────────

  async asientoVentaRestaurante(
    comandaId: number, comandaNumero: string, total: number, neto: number, itbis: number,
    metodoPago: string, fecha: string, userId: number,
  ): Promise<void> {
    if (total <= 0) return;
    const cuentaCaja = await this.resolverCuentaPorMetodoPago(metodoPago);
    const cuentas = await this.resolverCuentasConcepto([['VENTAS', COD.VENTAS], ['ITBIS_POR_PAGAR', COD.ITBIS_POR_PAGAR]]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Venta restaurante ${comandaNumero}`,
        tipoOrigen:      TipoOrigenAsiento.VENTA_RESTAURANTE,
        referenciaId:    comandaId,
        referenciaFolio: comandaNumero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentaCaja,             descripcion: `Cobro comanda ${comandaNumero}`,     debe: total, haber: 0 },
          { codigo: cuentas.VENTAS,         descripcion: `Venta restaurante ${comandaNumero}`,  debe: 0,     haber: neto },
          { codigo: cuentas.ITBIS_POR_PAGAR, descripcion: `ITBIS comanda ${comandaNumero}`,      debe: 0,     haber: itbis },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento venta restaurante ${comandaNumero} generado`);
      } else {
        this.logger.warn(`Asiento venta restaurante ${comandaNumero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento venta restaurante ${comandaNumero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_venta_restaurante', {
        tipoOrigen: TipoOrigenAsiento.VENTA_RESTAURANTE, referenciaId: String(comandaId), referenciaFolio: comandaNumero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Alta de un Activo Fijo (2026-09-19) → Activo Fijo (D) / contrapartida (H)
  // Antes de esta pieza, dar de alta un activo NO generaba NINGÚN asiento —
  // CategoriaActivo.cuentaActivoCodigo existía en la entidad pero no tenía
  // ningún consumidor. La cuenta del activo la decide la categoría
  // (configuración, no selección por documento); la contrapartida sí es un
  // selector por documento — la misma compra puede ser de contado (Bancos/
  // Caja) o a crédito (Proveedores), y este método no crea una CxP formal:
  // si fue a crédito, el contador elige "Proveedores" en el selector y
  // maneja la cuenta por pagar aparte (fuera del alcance de esta pieza).
  // ──────────────────────────────────────────────────────────────────

  private construirLineasAltaActivo(
    costo: number, codigoActivo: string, cuentaActivo: string,
    cuentaContrapartida: string, cuentaContrapartidaManual: boolean,
  ): LineaAsientoInput[] {
    return [
      { codigo: cuentaActivo,        descripcion: `Alta de activo ${codigoActivo}`, debe: costo, haber: 0 },
      { codigo: cuentaContrapartida, descripcion: `Alta de activo ${codigoActivo}`, debe: 0,     haber: costo, manual: cuentaContrapartidaManual },
    ];
  }

  /** Panel de vista previa: calcula el asiento de alta de activo SIN registrar nada. */
  async previsualizarAltaActivo(
    costo: number, codigoActivo: string, cuentaActivo: string, cuentaContrapartida?: string,
  ): Promise<PreviewAsientoResultado> {
    const cuentaBancos = await this.resolverCuentaConcepto('BANCOS', COD.BANCOS);
    return this.previsualizarLineas(
      this.construirLineasAltaActivo(costo, codigoActivo, cuentaActivo, cuentaContrapartida || cuentaBancos, false),
    );
  }

  async asientoAltaActivo(
    activoId: number, costo: number, codigoActivo: string, cuentaActivo: string,
    fecha: string, userId: number,
    cuentaContrapartida?: string, cuentaContrapartidaManual = false,
  ): Promise<void> {
    if (costo <= 0) return;
    const cuentaBancos = await this.resolverCuentaConcepto('BANCOS', COD.BANCOS);
    const lineas = this.construirLineasAltaActivo(
      costo, codigoActivo, cuentaActivo, cuentaContrapartida || cuentaBancos, cuentaContrapartidaManual,
    );
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Alta de activo ${codigoActivo}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    activoId,
        referenciaFolio: `ACT-${codigoActivo}`,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento alta de activo ${codigoActivo} generado`);
      } else {
        this.logger.warn(`Asiento alta de activo ${codigoActivo} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento alta de activo ${codigoActivo}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_alta_activo', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(activoId), referenciaFolio: `ACT-${codigoActivo}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Depreciación mensual → Gasto Depreciación / Depreciación Acumulada,
  // por CATEGORÍA de activo — antes era un solo total contra dos cuentas
  // fijas; CategoriaActivo.cuentaGastoCodigo/cuentaDepreciacionCodigo ya
  // existían pero nadie las leía (conectadas 2026-09-19, ver
  // activos-fijos.service.ts). Una empresa que crea una categoría custom
  // con sus propias cuentas ahora sí las usa; las 6 categorías DGII del
  // seed comparten hoy las mismas 2 cuentas, así que para ellas el asiento
  // sigue viéndose igual que antes — el cambio importa quirúrgicamente
  // para categorías custom.
  // ──────────────────────────────────────────────────────────────────

  // Fusiona el desglose por (cuentaGasto, cuentaDepreciacion) — varias
  // categorías pueden compartir el mismo par de cuentas (hoy, las 6
  // categorías DGII del seed lo hacen) — y arma las líneas del asiento.
  // PURO: sin BD, sin persistir — usado por asientoDepreciacion() (persiste)
  // y previsualizarDepreciacion() (panel de vista previa).
  private construirLineasDepreciacion(
    desglose: { cuentaGasto: string; cuentaDepreciacion: string; monto: number }[],
    periodo: string,
  ): { lineas: LineaAsientoInput[]; montoTotal: number; cuentas: number } {
    const porPar = new Map<string, { cuentaGasto: string; cuentaDepreciacion: string; monto: number }>();
    for (const d of desglose) {
      if (d.monto <= 0) continue;
      const key = `${d.cuentaGasto}|${d.cuentaDepreciacion}`;
      const acc = porPar.get(key) ?? { cuentaGasto: d.cuentaGasto, cuentaDepreciacion: d.cuentaDepreciacion, monto: 0 };
      acc.monto = +(acc.monto + d.monto).toFixed(2);
      porPar.set(key, acc);
    }
    const conMonto = Array.from(porPar.values());
    const montoTotal = +conMonto.reduce((s, d) => s + d.monto, 0).toFixed(2);
    const lineas = conMonto.flatMap((d) => [
      { codigo: d.cuentaGasto,        descripcion: `Gasto depreciación ${periodo}`, debe: d.monto, haber: 0 },
      { codigo: d.cuentaDepreciacion, descripcion: `Depreciación acum. ${periodo}`, debe: 0, haber: d.monto },
    ]);
    return { lineas, montoTotal, cuentas: conMonto.length };
  }

  async previsualizarDepreciacion(
    desglose: { cuentaGasto: string; cuentaDepreciacion: string; monto: number }[],
    periodo: string,
  ): Promise<PreviewAsientoResultado> {
    const { lineas } = this.construirLineasDepreciacion(desglose, periodo);
    if (lineas.length === 0) {
      return { ok: false, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: false, error: 'No hay depreciación con monto mayor a cero en el desglose.' };
    }
    return this.previsualizarLineas(lineas);
  }

  async asientoDepreciacion(
    desglose: { cuentaGasto: string; cuentaDepreciacion: string; monto: number }[],
    periodo: string,
    fecha: string, // último día de "periodo" ('YYYY-MM'), calculado por el caller sin new Date(string)/toISOString()
    userId: number,
  ): Promise<void> {
    const { lineas, montoTotal, cuentas } = this.construirLineasDepreciacion(desglose, periodo);
    if (lineas.length === 0) return;

    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Depreciación activos fijos ${periodo}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    0,
        referenciaFolio: `DEP-${periodo}`,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento depreciación ${periodo}: ${montoTotal.toFixed(2)} (${cuentas} cuenta(s) de gasto)`);
      } else {
        this.logger.warn(`Asiento depreciación ${periodo} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento depreciación ${periodo}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_depreciacion', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: '0', referenciaFolio: `DEP-${periodo}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Devolución de venta → reversa: Ventas (D) / ITBIS (D) / Clientes (H)
  // ──────────────────────────────────────────────────────────────────

  async asientoDevolucionVenta(
    devolucionId: number,
    total: number,
    subtotal: number,
    iva: number,
    numero: string,
    fecha: string, // dev.fecha
    userId: number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['VENTAS',          COD.VENTAS],
      ['ITBIS_POR_PAGAR', COD.ITBIS_POR_PAGAR],
      ['CLIENTES',        COD.CLIENTES],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Devolución de venta ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    devolucionId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.VENTAS,          descripcion: `Reversa venta ${numero}`,   debe: subtotal, haber: 0 },
          { codigo: cuentas.ITBIS_POR_PAGAR, descripcion: `Reversa ITBIS ${numero}`,   debe: iva,      haber: 0 },
          { codigo: cuentas.CLIENTES,        descripcion: `Nota crédito ${numero}`,     debe: 0,        haber: total },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento devolución ${numero} generado`);
      } else {
        this.logger.warn(`Asiento devolución ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento devolución ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_devolucion_venta', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(devolucionId), referenciaFolio: numero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Gasto operativo → Gasto (D) + ITBIS Crédito (D) / Bancos (H)
  // ──────────────────────────────────────────────────────────────────

  /**
   * Líneas del asiento de un gasto — extraído a su propia función (2026-09-19,
   * panel de vista previa) para que `asientoGasto()` (persiste) y
   * `previsualizarGasto()` (no persiste) arranquen EXACTAMENTE del mismo
   * cálculo. Pura y síncrona: nada de DB aquí, solo la forma del asiento.
   */
  private construirLineasGasto(
    total: number, monto: number, itbis: number, descripcion: string, cuentaGasto: string, cuentaManual: boolean,
    cuentas: { itbisCredito: string; bancos: string },
  ): LineaAsientoInput[] {
    return [
      { codigo: cuentaGasto,            descripcion, debe: monto, haber: 0, manual: cuentaManual },
      ...(itbis > 0 ? [{ codigo: cuentas.itbisCredito, descripcion: `ITBIS crédito ${descripcion}`, debe: itbis, haber: 0 }] : []),
      { codigo: cuentas.bancos, descripcion: `Pago ${descripcion}`, debe: 0, haber: total },
    ];
  }

  // Configuración Contable — grupo Gastos: ITBIS Crédito (mismo concepto que
  // Compras), Bancos (pago), y el default de "cuenta de gasto" cuando la
  // categoría no tiene una propia (GASTO_DEFAULT, antes '6.1.2.04' fijo).
  private async resolverCuentasGasto() {
    return this.resolverCuentasConcepto([
      ['ITBIS_CREDITO', COD.ITBIS_CREDITO_COMPRAS],
      ['BANCOS',        COD.BANCOS],
      ['GASTO_DEFAULT', '6.1.2.04'],
    ]);
  }

  /**
   * Vista previa del asiento de un gasto, sin persistir nada — mismas
   * líneas que `asientoGasto()` generaría, resueltas contra el catálogo
   * real (nombre de cuenta, cuadre). El formulario de Gastos la llama antes
   * de guardar para mostrar el panel de vista previa.
   */
  async previsualizarGasto(
    total: number, monto: number, itbis: number, descripcion: string, cuentaGasto?: string,
  ): Promise<PreviewAsientoResultado> {
    const cuentas = await this.resolverCuentasGasto();
    return this.previsualizarLineas(this.construirLineasGasto(total, monto, itbis, descripcion, cuentaGasto || cuentas.GASTO_DEFAULT, false, {
      itbisCredito: cuentas.ITBIS_CREDITO, bancos: cuentas.BANCOS,
    }));
  }

  async asientoGasto(
    gastoId:      number,
    total:        number,
    monto:        number,
    itbis:        number,
    descripcion:  string,
    fecha:        string, // dto.fecha del gasto
    userId:       number,
    cuentaGasto = '6.1.2.04', // Gastos Generales — puede personalizarse por categoría
    cuentaManual = false,     // true = el usuario eligió esta cuenta a propósito, distinta del default de su categoría
  ): Promise<void> {
    try {
      const cuentas = await this.resolverCuentasGasto();
      const lineas = this.construirLineasGasto(total, monto, itbis, descripcion, cuentaGasto, cuentaManual, {
        itbisCredito: cuentas.ITBIS_CREDITO, bancos: cuentas.BANCOS,
      });

      const asiento = await this._crearAsientoContabilizado({
        descripcion,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    gastoId,
        referenciaFolio: `GST-${gastoId}`,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento gasto #${gastoId} generado: ${total.toFixed(2)}`);
      } else {
        this.logger.warn(`Asiento gasto #${gastoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento gasto #${gastoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_gasto', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(gastoId), referenciaFolio: `GST-${gastoId}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Anticipo recibido de cliente → Caja/Banco / Anticipos de Clientes
  // Efectivo: DÉBITO Caja. Resto: DÉBITO Bancos.
  // CRÉDITO: Anticipos de Clientes (pasivo 2.1.5.01)
  // Retorna el id del asiento generado, o null si falló.
  // ──────────────────────────────────────────────────────────────────

  async asientoAnticipo(
    monto:      number,
    anticipoId: number,
    tipoPago:   string,
    fecha:      string, // fechaHoyRD() del caller — el anticipo siempre se registra "hoy", nunca backdateado
    userId:     number,
  ): Promise<number | null> {
    const cuentaDebito = await this.resolverCuentaPorMetodoPago(tipoPago);
    const cuentaAnticipos = await this.resolverCuentaConcepto('ANTICIPOS_CLIENTES', COD.ANTICIPOS_CLIENTES);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Anticipo recibido #${anticipoId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    anticipoId,
        referenciaFolio: `ANT-${anticipoId}`,
        fecha,
        userId,
        lineas: [
          { codigo: cuentaDebito,      descripcion: `Ingreso anticipo #${anticipoId}`,           debe: monto, haber: 0    },
          { codigo: cuentaAnticipos,   descripcion: `Anticipo recibido de cliente #${anticipoId}`, debe: 0,   haber: monto },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento anticipo #${anticipoId} generado`);
      } else {
        this.logger.warn(`Asiento anticipo #${anticipoId} NO generado (cuenta faltante) — ver Sentry`);
      }
      return asiento?.id ?? null;
    } catch (err) {
      this.logger.error(`Error asiento anticipo #${anticipoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_anticipo', {
        tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: String(anticipoId), referenciaFolio: `ANT-${anticipoId}`,
      });
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Aplicación de anticipo a CxC → Anticipos de Clientes / Clientes
  // DÉBITO: Anticipos de Clientes (libera el pasivo)
  // CRÉDITO: Clientes (reduce la cuenta por cobrar)
  // ──────────────────────────────────────────────────────────────────

  async asientoAplicarAnticipo(
    monto:      number,
    anticipoId: number,
    cxcId:      number,
    fecha:      string, // fechaHoyRD() del caller — la aplicación ocurre "ahora", AplicarAnticipoDto no trae fecha
    userId:     number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['ANTICIPOS_CLIENTES', COD.ANTICIPOS_CLIENTES],
      ['CLIENTES',           COD.CLIENTES],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Aplicación anticipo #${anticipoId} → CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    anticipoId,
        referenciaFolio: `ANT-${anticipoId}`,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.ANTICIPOS_CLIENTES, descripcion: `Aplicar anticipo #${anticipoId}`,   debe: monto, haber: 0    },
          { codigo: cuentas.CLIENTES,           descripcion: `Abono CxC #${cxcId} por anticipo`,  debe: 0,     haber: monto },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento aplicación anticipo #${anticipoId} → CxC #${cxcId}`);
      } else {
        this.logger.warn(`Asiento aplicación anticipo #${anticipoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento aplicar anticipo #${anticipoId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_aplicar_anticipo', {
        tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: String(anticipoId), referenciaFolio: `ANT-${anticipoId}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reversión de cobro (anulación de recibo) → Clientes / Bancos
  // Inverso del asientoCobro: DÉBITO Clientes, CRÉDITO Bancos
  // ──────────────────────────────────────────────────────────────────

  async asientoReversion(
    monto:     number,
    cxcId:     number,
    reciboId:  number,
    tipo:      string,
    fecha:     string, // fecha del EVENTO de reversión (fechaHoyRD()), no la del recibo original — mismo criterio que revertirAsiento()
    userId:    number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['CLIENTES', COD.CLIENTES],
      ['BANCOS',   COD.BANCOS],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Reversión ${tipo} #${reciboId} — CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    reciboId,
        referenciaFolio: `REV-${reciboId}`,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.CLIENTES, descripcion: `Reversar cobro CxC #${cxcId}`, debe: monto, haber: 0    },
          { codigo: cuentas.BANCOS,   descripcion: `Reversar ingreso ${tipo} #${reciboId}`, debe: 0, haber: monto },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento reversión ${tipo} #${reciboId} generado`);
      } else {
        this.logger.warn(`Asiento reversión ${tipo} #${reciboId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento reversión ${tipo} #${reciboId}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_reversion', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(reciboId), referenciaFolio: `REV-${reciboId}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Manufactura — acceso público al builder genérico
  // Permite a ManufacturaService crear asientos con cuentas arbitrarias
  // sin duplicar la lógica de numeración y persistencia.
  // ──────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────
  // Orden de mantenimiento completada → Gasto (D) / Proveedores (H)
  // ──────────────────────────────────────────────────────────────────

  async asientoMantenimiento(
    ordenId: number,
    costo:   number,
    numero:  string,
    fecha:   string, // dto.fechaRealizada de la orden (o fechaHoyRD() del caller si no vino)
    userId:  number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['MANTENIMIENTO_GASTO', '6.1.2.04'],
      ['PROVEEDORES',         COD.PROVEEDORES],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Gasto mantenimiento ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    ordenId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.MANTENIMIENTO_GASTO, descripcion: `Gasto mantenimiento ${numero}`, debe: costo, haber: 0 },
          { codigo: cuentas.PROVEEDORES,          descripcion: `CxP mantenimiento ${numero}`,   debe: 0,     haber: costo },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento mantenimiento ${numero}: ${costo.toFixed(2)}`);
      } else {
        this.logger.warn(`Asiento mantenimiento ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento mantenimiento ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_mantenimiento', {
        tipoOrigen: TipoOrigenAsiento.AJUSTE, referenciaId: String(ordenId), referenciaFolio: numero,
      });
    }
  }

  /**
   * Crea un asiento contabilizado con líneas de cuentas arbitrarias.
   * Retorna el AsientoContable creado, o null si alguna cuenta no existe.
   * Úsalo desde módulos que generan asientos automáticos fuera de contabilidad.
   */
  async crearAsientoContabilizado(params: {
    descripcion: string;
    tipoOrigen: TipoOrigenAsiento;
    referenciaId: number;
    referenciaFolio: string;
    fecha: string; // 'YYYY-MM-DD' del documento origen — P3 Bloque 3, ver _crearAsientoContabilizado
    userId: number;
    lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }>;
  }): Promise<import('../entities/asiento-contable.entity').AsientoContable | null> {
    return this._crearAsientoContabilizado(params);
  }

  // ──────────────────────────────────────────────────────────────────
  // PRESTAMISTA: Desembolso de préstamo
  // Cartera de Crédito (D) / Bancos o Caja (H)
  // ──────────────────────────────────────────────────────────────────
  async asientoDesembolsoPrestamo(
    prestamoId:   number,
    numero:       string,
    monto:        number,
    formaPago:    string,
    fecha:        string, // data.fechaDesembolso
    userId:       number,
  ): Promise<void> {
    const cuentaHaber  = await this.resolverCuentaPorMetodoPago(formaPago);
    const cuentaCartera = await this.resolverCuentaConcepto('PRESTAMO_CARTERA', '1.1.2.10');
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Desembolso préstamo ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.PRESTAMISTA,
        referenciaId:    prestamoId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentaCartera, descripcion: `Cartera crédito ${numero}`,  debe: monto, haber: 0     },
          { codigo: cuentaHaber, descripcion: `Desembolso préstamo ${numero}`, debe: 0, haber: monto },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento desembolso préstamo ${numero} generado`);
      } else {
        this.logger.warn(`Asiento desembolso préstamo ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento desembolso ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_desembolso_prestamo', {
        tipoOrigen: TipoOrigenAsiento.PRESTAMISTA, referenciaId: String(prestamoId), referenciaFolio: numero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PRESTAMISTA: Pago recibido
  // Bancos/Caja (D) / Cartera de Crédito + Intereses + Mora (H)
  // ──────────────────────────────────────────────────────────────────
  async asientoPagoPrestamo(
    pagoId:         number,
    numeroPago:     string,
    numeroPrestamo: string,
    formaPago:      string,
    capitalAplicado:  number,
    interesAplicado:  number,
    moraAplicada:     number,
    fecha:          string, // fechaHoyRD() del caller — RegistrarPagoDto no trae fecha, el pago siempre es "ahora"
    userId:         number,
  ): Promise<void> {
    const totalPago = capitalAplicado + interesAplicado + moraAplicada;
    if (totalPago <= 0) return;
    const cuentaDebito  = await this.resolverCuentaPorMetodoPago(formaPago);
    const cuentaCartera = await this.resolverCuentaConcepto('PRESTAMO_CARTERA',   '1.1.2.10');
    const cuentaInteres = await this.resolverCuentaConcepto('PRESTAMO_INTERESES', '4.1.2.01');
    const cuentaMora    = await this.resolverCuentaConcepto('PRESTAMO_MORA',      '4.1.2.02');
    const lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }> = [
      { codigo: cuentaDebito, descripcion: `Pago recibido ${numeroPago}`, debe: totalPago, haber: 0 },
    ];
    if (capitalAplicado > 0)
      lineas.push({ codigo: cuentaCartera, descripcion: `Capital préstamo ${numeroPrestamo}`, debe: 0, haber: capitalAplicado });
    if (interesAplicado > 0)
      lineas.push({ codigo: cuentaInteres, descripcion: `Intereses préstamo ${numeroPrestamo}`, debe: 0, haber: interesAplicado });
    if (moraAplicada > 0)
      lineas.push({ codigo: cuentaMora, descripcion: `Mora préstamo ${numeroPrestamo}`, debe: 0, haber: moraAplicada });
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Pago préstamo ${numeroPago} — ${numeroPrestamo}`,
        tipoOrigen:      TipoOrigenAsiento.PRESTAMISTA,
        referenciaId:    pagoId,
        referenciaFolio: numeroPago,
        fecha,
        userId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento pago ${numeroPago} generado`);
      } else {
        this.logger.warn(`Asiento pago ${numeroPago} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento pago ${numeroPago}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_pago_prestamo', {
        tipoOrigen: TipoOrigenAsiento.PRESTAMISTA, referenciaId: String(pagoId), referenciaFolio: numeroPago,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Gasto de importación aplicado
  // DR 1.1.3.01 Inventario / CR 2.1.6.01 Gastos de Importación por Aplicar
  //
  // La cuenta 2.1.6.01 es TRANSITORIA: queda en el pasivo hasta que el
  // usuario registre la factura del agente aduanal como compra normal
  // cargando contra esa misma cuenta. Así el pasivo se crea una sola vez.
  // ──────────────────────────────────────────────────────────────────

  async asientoGastoImportacion(
    params: {
      gastoId:     number;
      concepto:    string;
      montoDOP:    number;
      compraFolio: string;
      fecha:       string; // compra.fecha (propagada desde compras.service.ts) o fechaHoyRD() en el retroactivo
      usuarioId:   number;
    },
    manager?: EntityManager,
  ): Promise<void> {
    if (params.montoDOP <= 0) return;

    const cuentas = await this.resolverCuentasConcepto([
      ['INVENTARIO',              COD.INVENTARIO],
      ['GASTOS_IMPORT_X_APLICAR', COD.GASTOS_IMPORT_X_APLICAR],
    ]);
    const lineas = [
      {
        codigo:      cuentas.INVENTARIO,
        descripcion: `Costo importación — ${params.concepto}`,
        debe:        params.montoDOP,
        haber:       0,
      },
      {
        codigo:      cuentas.GASTOS_IMPORT_X_APLICAR,
        descripcion: `Gasto por aplicar — ${params.concepto}`,
        debe:        0,
        haber:       params.montoDOP,
      },
    ];

    if (manager) {
      // Dentro de una transacción externa: propagar el error para que el caller
      // haga rollback completo. El inventario y el mayor contable deben quedar
      // siempre en sintonía.
      const asientoTx = await this._crearAsientoContabilizado(
        {
          descripcion:     `Gasto importación: ${params.concepto} — ${params.compraFolio}`,
          tipoOrigen:      TipoOrigenAsiento.IMPORTACION,
          referenciaId:    params.gastoId,
          referenciaFolio: `GIMP-${params.gastoId}`,
          fecha:           params.fecha,
          userId:          params.usuarioId,
          lineas,
        },
        manager,
      );
      if (asientoTx) {
        this.logger.log(
          `Asiento gasto importación #${params.gastoId} generado (en tx) — ${params.montoDOP} DOP`,
        );
      } else {
        this.logger.warn(`Asiento gasto importación #${params.gastoId} NO generado (cuenta faltante) — ver Sentry`);
      }
      return;
    }

    // Sin manager (Caso A — llamado desde aplicarGastosPendientes fuera de tx):
    // el asiento es best-effort; un fallo no interrumpe la recepción ya confirmada.
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Gasto importación: ${params.concepto} — ${params.compraFolio}`,
        tipoOrigen:      TipoOrigenAsiento.IMPORTACION,
        referenciaId:    params.gastoId,
        referenciaFolio: `GIMP-${params.gastoId}`,
        fecha:           params.fecha,
        userId:          params.usuarioId,
        lineas,
      });
      if (asiento) {
        this.logger.log(`Asiento gasto importación #${params.gastoId} generado — ${params.montoDOP} DOP`);
      } else {
        this.logger.warn(`Asiento gasto importación #${params.gastoId} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(
        `Error asiento gasto importación #${params.gastoId}: ${(err as Error).message}`,
      );
      this.reportarFalloAsiento(err, 'asiento_gasto_importacion', {
        tipoOrigen: TipoOrigenAsiento.IMPORTACION, referenciaId: String(params.gastoId), referenciaFolio: `GIMP-${params.gastoId}`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Nota de Crédito aceptada por DGII → mismo criterio de cuentas que
  // asientoDevolucionVenta (reversa: Ventas/ITBIS debitados, Clientes
  // acreditado), pero con su propio tipoOrigen para no colisionar con
  // devoluciones/gastos/nómina/mantenimiento en revertirAsiento().
  // Sirve tanto para NC total (nc.total == factura.total → efecto neto cero
  // al sumarla con la factura) como para NC parcial (ajuste proporcional).
  // ──────────────────────────────────────────────────────────────────

  async asientoNotaCredito(
    ncId:     number,
    total:    number,
    subtotal: number,
    iva:      number,
    numero:   string,
    fecha:    string, // nc.fecha
    userId:   number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['VENTAS',          COD.VENTAS],
      ['ITBIS_POR_PAGAR', COD.ITBIS_POR_PAGAR],
      ['CLIENTES',        COD.CLIENTES],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Nota de crédito ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.NOTA_CREDITO,
        referenciaId:    ncId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.VENTAS,          descripcion: `Reversa venta — NC ${numero}`, debe: subtotal, haber: 0 },
          { codigo: cuentas.ITBIS_POR_PAGAR, descripcion: `Reversa ITBIS — NC ${numero}`, debe: iva,      haber: 0 },
          { codigo: cuentas.CLIENTES,        descripcion: `Nota de crédito ${numero}`,    debe: 0,        haber: total },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento nota de crédito ${numero} generado`);
      } else {
        this.logger.warn(`Asiento nota de crédito ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento nota de crédito ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_nota_credito', {
        tipoOrigen: TipoOrigenAsiento.NOTA_CREDITO, referenciaId: String(ncId), referenciaFolio: numero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Nota de Débito (E33) al emitirse → mismo criterio de cuentas que
  // asientoFacturaEmitida (no es una reversa: una ND aumenta lo que debe el
  // cliente, igual que una venta). Debe Clientes / Haber Ventas + ITBIS por
  // Pagar. Namespace propio (NOTA_DEBITO) para no colisionar en
  // revertirAsiento().
  // ──────────────────────────────────────────────────────────────────

  async asientoNotaDebito(
    ndId:     number,
    total:    number,
    subtotal: number,
    iva:      number,
    numero:   string,
    fecha:    string, // nd.fecha
    userId:   number,
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['CLIENTES',        COD.CLIENTES],
      ['VENTAS',          COD.VENTAS],
      ['ITBIS_POR_PAGAR', COD.ITBIS_POR_PAGAR],
    ]);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Nota de débito ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.NOTA_DEBITO,
        referenciaId:    ndId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.CLIENTES,        descripcion: `Cta. por cobrar — ND ${numero}`,   debe: total,    haber: 0 },
          { codigo: cuentas.VENTAS,          descripcion: `Cargo adicional — ND ${numero}`,    debe: 0,        haber: subtotal },
          { codigo: cuentas.ITBIS_POR_PAGAR, descripcion: `ITBIS débito fiscal — ND ${numero}`, debe: 0,        haber: iva },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento nota de débito ${numero} generado`);
      } else {
        this.logger.warn(`Asiento nota de débito ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento nota de débito ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_nota_debito', {
        tipoOrigen: TipoOrigenAsiento.NOTA_DEBITO, referenciaId: String(ndId), referenciaFolio: numero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Nota de Crédito de Compra al recibirse — la cuenta que se acredita
  // depende del TIPO de efecto (ver TipoNCCompra en la entidad):
  //
  //   devolucion_inventario / no_recibida: mismo criterio que
  //     asientoCompraRecibida, invertido — Haber [cuentaDestinoOriginal ??
  //     Inventario] + Haber ITBIS Crédito Fiscal / Debe Proveedores. Las dos
  //     comparten fórmula porque las dos corrigen el mismo compromiso que la
  //     compra original registró contra esa cuenta — con o sin movimiento
  //     físico (no_recibida nunca tuvo movimiento físico que revertir; la
  //     cantidad física ya fue validada aparte, en el servicio que llama).
  //
  //   ajuste_sin_devolucion: NO se toca la cuenta de destino de la compra
  //     (la mercancía, si entró, se queda en inventario) — se acredita Costo
  //     de Ventas, porque lo que se corrige es el VALOR reconocido, no una
  //     existencia. Mismo Haber ITBIS Crédito Fiscal / Debe Proveedores.
  //
  // Namespace propio (NOTA_CREDITO_COMPRA) para no colisionar en
  // revertirAsiento().
  // ──────────────────────────────────────────────────────────────────

  async asientoNotaCreditoCompra(
    nccId:    number,
    total:    number,
    subtotal: number,
    iva:      number,
    numero:   string,
    fecha:    string, // ncc.fecha
    userId:   number,
    opciones?: {
      /** Compra.cuentaDestino de la OC original, si la tenía — reemplaza el
       *  default Inventario para devolucion_inventario/no_recibida. */
      cuentaDestinoOriginal?: string;
      /** true = ajuste_sin_devolucion: acredita Costo de Ventas en vez de
       *  la cuenta de destino de la compra. */
      sinInventario?: boolean;
    },
  ): Promise<void> {
    const cuentas = await this.resolverCuentasConcepto([
      ['PROVEEDORES',   COD.PROVEEDORES],
      ['INVENTARIO',    COD.INVENTARIO],
      ['COSTO_VENTAS',  COD.COSTO_VENTAS],
      ['ITBIS_CREDITO', COD.ITBIS_CREDITO],
    ]);
    const cuentaCredito = opciones?.sinInventario
      ? cuentas.COSTO_VENTAS
      : (opciones?.cuentaDestinoOriginal || cuentas.INVENTARIO);
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Nota de crédito de compra ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.NOTA_CREDITO_COMPRA,
        referenciaId:    nccId,
        referenciaFolio: numero,
        fecha,
        userId,
        lineas: [
          { codigo: cuentas.PROVEEDORES,   descripcion: `Devolución a proveedor — NCC ${numero}`, debe: total, haber: 0 },
          { codigo: cuentaCredito,         descripcion: `Reversa mercancía — NCC ${numero}`,       debe: 0,     haber: subtotal,
            manual: !!opciones?.cuentaDestinoOriginal },
          { codigo: cuentas.ITBIS_CREDITO, descripcion: `Reversa ITBIS crédito — NCC ${numero}`,   debe: 0,     haber: iva },
        ],
      });
      if (asiento) {
        this.logger.log(`Asiento nota de crédito de compra ${numero} generado`);
      } else {
        this.logger.warn(`Asiento nota de crédito de compra ${numero} NO generado (cuenta faltante) — ver Sentry`);
      }
    } catch (err) {
      this.logger.error(`Error asiento nota de crédito de compra ${numero}: ${(err as Error).message}`);
      this.reportarFalloAsiento(err, 'asiento_nota_credito_compra', {
        tipoOrigen: TipoOrigenAsiento.NOTA_CREDITO_COMPRA, referenciaId: String(nccId), referenciaFolio: numero,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reversas — contra-asiento NUEVO, nunca se borra/edita/desactiva el
  // original.
  //
  // REGLA DE DISEÑO (no reabrir): el original conserva su fecha; el
  // contra-asiento lleva la fecha del EVENTO de reversión (fechaReversion,
  // pásale fechaHoyRD() — nunca la fecha del documento original), así un
  // período ya cerrado no cambia retroactivamente.
  //
  // Idempotente vía asientoRevertidoId: si ya existe un contra-asiento para
  // el original encontrado, lo retorna sin duplicar. Si no encuentra el
  // asiento original (el documento nunca se contabilizó), reporta a Sentry y
  // retorna null sin romper — igual que el resto de este servicio, nunca
  // lanza: quien llama no necesita su propio try/catch.
  //
  // referenciaFolio es opcional pero se recomienda pasarlo siempre: tipoOrigen
  // (sobre todo 'cobro' y 'ajuste') se reutiliza entre varios tipos de
  // documento, cada uno con su propio espacio de referenciaId — dos tablas
  // distintas pueden coincidir en el mismo id numérico. El folio (p. ej.
  // "CXC-47", "ANT-12") sí es único porque lleva el prefijo del tipo.
  // ──────────────────────────────────────────────────────────────────

  async revertirAsiento(
    tipoOrigen:      TipoOrigenAsiento,
    referenciaId:    number,
    fechaReversion:  string,
    motivo:          string,
    referenciaFolio?: string,
  ): Promise<AsientoContable | null> {
    try {
      // Lanza si no hay contexto de empresa — lo atrapa el catch de abajo,
      // que ya reporta y devuelve null sin romper al caller (misma garantía
      // que el resto de este método). Antes `this.eid` tragaba la excepción
      // y dejaba `empresaId` en undefined: whereOriginal quedaba sin filtro
      // y podía encontrar (y revertir) el asiento de OTRA empresa.
      const empresaId = this.tenantService.getEmpresaId();

      const whereOriginal: any = {
        empresaId,
        tipoOrigen,
        referenciaId,
        estado: EstadoAsiento.CONTABILIZADO,
        asientoRevertidoId: IsNull(),
      };
      if (referenciaFolio) whereOriginal.referenciaFolio = referenciaFolio;

      const original = await this.asientoRepository.findOne({
        where: whereOriginal,
        relations: ['lineas'],
        order: { id: 'ASC' },
      });

      if (!original) {
        this.logger.warn(
          `revertirAsiento: no se encontró asiento original tipoOrigen=${tipoOrigen} ` +
          `referenciaId=${referenciaId}${referenciaFolio ? ` referenciaFolio=${referenciaFolio}` : ''} — ` +
          `el documento nunca se contabilizó`,
        );
        this.reportarFalloAsiento(
          new Error(
            `No existe asiento original para revertir (tipoOrigen=${tipoOrigen}, ` +
            `referenciaId=${referenciaId}${referenciaFolio ? `, referenciaFolio=${referenciaFolio}` : ''})`,
          ),
          'asiento_reversa_original_no_encontrado',
          { tipoOrigen, referenciaId: String(referenciaId), referenciaFolio: referenciaFolio ?? '' },
        );
        return null;
      }

      // Idempotencia: ¿ya existe un contra-asiento para este original?
      const existente = await this.asientoRepository.findOne({
        where: { asientoRevertidoId: original.id, empresaId },
      });
      if (existente) {
        this.logger.warn(
          `revertirAsiento: ya existe contra-asiento #${existente.id} (${existente.numero}) ` +
          `para el asiento #${original.id} (${original.numero}) — no se duplica`,
        );
        return existente;
      }

      // Invertir cada línea: debe <-> haber. Mismas cuentas que el original —
      // no hay que volver a resolverlas por código, ya sabemos su id.
      const lineasInvertidas = original.lineas.map((l) => ({
        cuentaContableId: l.cuentaContableId,
        descripcion:      `Reversa: ${l.descripcion}`.slice(0, 200),
        debe:             Number(l.haber),
        haber:            Number(l.debe),
      }));
      const totalDebe  = lineasInvertidas.reduce((s, l) => s + l.debe,  0);
      const totalHaber = lineasInvertidas.reduce((s, l) => s + l.haber, 0);

      const numero = await this.generarNumero(empresaId);

      const asientoInstance = this.asientoRepository.create({
        empresaId,
        numero,
        fecha:           fechaReversion as unknown as Date, // string 'YYYY-MM-DD', nunca new Date(string)
        descripcion:     `Reversa de asiento #${original.numero} — ${motivo}`.slice(0, 300),
        tipoOrigen:      original.tipoOrigen,
        referenciaId:    original.referenciaId,
        referenciaFolio: original.referenciaFolio,
        estado:          EstadoAsiento.CONTABILIZADO,
        totalDebe:       Number(totalDebe.toFixed(2)),
        totalHaber:      Number(totalHaber.toFixed(2)),
        userId:          this.tenantService.getUserId() ?? 0,
        asientoRevertidoId: original.id,
      });
      const asiento = await this.asientoRepository.save(asientoInstance);

      const lineasInstances = this.lineaRepository.create(
        lineasInvertidas.map((l) => ({ asientoId: asiento.id, ...l })),
      );
      await this.lineaRepository.save(lineasInstances);

      this.logger.log(
        `Reversa generada: asiento #${asiento.id} (${numero}) revierte #${original.id} (${original.numero}) — ${motivo}`,
      );
      return asiento;
    } catch (err) {
      this.logger.error(
        `Error revertirAsiento tipoOrigen=${tipoOrigen} referenciaId=${referenciaId}: ${(err as Error).message}`,
      );
      this.reportarFalloAsiento(err, 'asiento_reversion_generica', {
        tipoOrigen, referenciaId: String(referenciaId), referenciaFolio: referenciaFolio ?? '',
      });
      return null;
    }
  }
}
