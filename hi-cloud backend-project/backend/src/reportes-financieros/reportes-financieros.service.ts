import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';
import { TenantService } from '../tenant/tenant.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { SaldosCuentasService } from './saldos-cuentas.service';

export interface LineaCuenta {
  codigo:      string;
  nombre:      string;
  tipo:        string;
  naturaleza:  string;
  nivel:       number;
  totalDebe:   number;
  totalHaber:  number;
  saldo:       number;
}

@Injectable()
export class ReportesFinancierosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AsientoContable)
    private readonly asientoRepo: Repository<AsientoContable>,
    private readonly tenantSvc: TenantService,
    private readonly saldosCuentasService: SaldosCuentasService,
  ) {}

  /**
   * empresaId del request actual. FALLA CERRADO: si no hay contexto de empresa
   * lanza en vez de ejecutar la query sin filtro.
   *
   * Estas consultas usan SQL crudo (dataSource.query), que NO pasa por
   * TenantAwareRepository ni por el TenantSubscriber: el filtro por empresaId
   * es responsabilidad explicita de cada query de este servicio. Tampoco hay
   * RLS en Postgres como segunda linea de defensa.
   */
  private get eid(): number {
    const id = this.tenantSvc.getEmpresaIdOrNull();
    if (!id) throw new TenantContextMissingException('CuentaContable', 'ReportesFinancierosService');
    return id;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private agruparPorTipo(cuentas: LineaCuenta[], tipo: string) {
    return cuentas
      .filter(c => c.tipo === tipo && c.nivel === 4 && c.saldo !== 0)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  private subtotal(cuentas: LineaCuenta[], tipo: string) {
    return cuentas
      .filter(c => c.tipo === tipo)
      .reduce((s, c) => s + c.saldo, 0);
  }

  // ─── Movimientos por cuenta (base de los 2 informes) ─────────────────────────
  //
  // Balance/Diagnóstico (2026-09-20): delega en SaldosCuentasService, la
  // MISMA función que usa Balance de Comprobación — antes cada motor tenía
  // su propia consulta SQL de aquí y podían divergir para una cuenta cuyo
  // movimiento va contra su naturaleza declarada. LineaCuenta se mantiene
  // como alias del tipo compartido para no tocar el resto de este archivo.

  private async getMovimientosCuentas(desde?: string, hasta?: string): Promise<LineaCuenta[]> {
    return this.saldosCuentasService.obtenerSaldos(this.eid, desde, hasta);
  }

  /** Neto ingresos − costos − gastos para un rango — la misma fórmula que estadoResultados(). */
  private async resultadoNeto(desde: string | undefined, hasta: string): Promise<number> {
    const cuentas = await this.getMovimientosCuentas(desde, hasta);
    const neto = ['ingreso', 'costo', 'gasto'].reduce((acc, tipo) => {
      const subtotal = this.subtotal(cuentas, tipo);
      return tipo === 'ingreso' ? acc + subtotal : acc - subtotal;
    }, 0);
    return +neto.toFixed(2);
  }

  // ─── Balance General ──────────────────────────────────────────────────────────

  async balanceGeneral(fechaCorte: string) {
    const cuentas = await this.getMovimientosCuentas(undefined, fechaCorte);

    const activos    = this.agruparPorTipo(cuentas, 'activo');
    const pasivos    = this.agruparPorTipo(cuentas, 'pasivo');
    const patrimonio = this.agruparPorTipo(cuentas, 'patrimonio');

    const totalActivos       = this.subtotal(activos, 'activo');
    const totalPasivos       = this.subtotal(pasivos, 'pasivo');
    const totalPatrimonioCta = this.subtotal(patrimonio, 'patrimonio');

    // Balance/Diagnóstico (2026-09-20) — "Resultado del ejercicio" y
    // "Resultados acumulados": el motor no tiene asiento de cierre de
    // ejercicio (ver contabilidad/), así que ingresos, costos y gastos se
    // acumulan sin límite de fecha en sus propias cuentas y JAMÁS se
    // reflejaban en Patrimonio — la ecuación del balance no podía cuadrar
    // desde el primer año con actividad. Son líneas CALCULADAS en cada
    // consulta (nunca un asiento, nunca se persisten). El ejercicio fiscal
    // se asume año calendario (no hay configuración de ejercicio fiscal
    // distinto por empresa en el sistema hoy).
    const anio                 = Number(fechaCorte.slice(0, 4));
    const inicioEjercicio      = `${anio}-01-01`;
    const finEjercicioAnterior = `${anio - 1}-12-31`;

    const [resultadoDelEjercicio, resultadosAcumulados, asientosDescuadrados] = await Promise.all([
      this.resultadoNeto(inicioEjercicio, fechaCorte),
      this.resultadoNeto(undefined, finEjercicioAnterior),
      this.saldosCuentasService.obtenerAsientosDescuadrados(this.eid, fechaCorte),
    ]);

    const totalPatrimonio = +(totalPatrimonioCta + resultadoDelEjercicio + resultadosAcumulados).toFixed(2);
    // La ecuación se evalúa sobre los libros tal como están — un descuadre
    // de asientos históricos (si lo hay) se reporta aparte, nunca se
    // absorbe en silencio dentro de "cuadrado".
    const ecuacion = +(totalActivos - (totalPasivos + totalPatrimonio)).toFixed(2);
    const diferenciaDescuadrados = +asientosDescuadrados.reduce((s, a) => s + a.diferencia, 0).toFixed(2);

    // Activo corriente vs no corriente
    const activoCorriente    = activos.filter(c => c.codigo.startsWith('1.1'));
    const activoNoCorriente  = activos.filter(c => c.codigo.startsWith('1.2'));
    const pasivoCorriente    = pasivos.filter(c => c.codigo.startsWith('2.1'));
    const pasivoNoCorriente  = pasivos.filter(c => c.codigo.startsWith('2.2'));

    return {
      fechaCorte,
      activo: {
        corriente:    { cuentas: activoCorriente,   total: +activoCorriente.reduce((s, c) => s + c.saldo, 0).toFixed(2) },
        noCorriente:  { cuentas: activoNoCorriente,  total: +activoNoCorriente.reduce((s, c) => s + c.saldo, 0).toFixed(2) },
        total:        +totalActivos.toFixed(2),
      },
      pasivo: {
        corriente:    { cuentas: pasivoCorriente,   total: +pasivoCorriente.reduce((s, c) => s + c.saldo, 0).toFixed(2) },
        noCorriente:  { cuentas: pasivoNoCorriente,  total: +pasivoNoCorriente.reduce((s, c) => s + c.saldo, 0).toFixed(2) },
        total:        +totalPasivos.toFixed(2),
      },
      patrimonio: {
        cuentas: patrimonio,
        // Líneas calculadas — no vienen de ninguna cuenta ni asiento.
        calculadas: {
          resultadoDelEjercicio: { desde: inicioEjercicio, hasta: fechaCorte, monto: resultadoDelEjercicio },
          resultadosAcumulados:  { hasta: finEjercicioAnterior, monto: resultadosAcumulados },
        },
        total: totalPatrimonio,
      },
      diferenciaAsientosDescuadrados: {
        total:    diferenciaDescuadrados,
        cantidad: asientosDescuadrados.length,
      },
      totales: {
        activos:           +totalActivos.toFixed(2),
        pasivosPatrimonio: +(totalPasivos + totalPatrimonio).toFixed(2),
        ecuacion,
        cuadrado:          Math.abs(ecuacion) < 0.01,
      },
    };
  }

  // ─── Estado de Resultados ─────────────────────────────────────────────────────

  async estadoResultados(desde: string, hasta: string) {
    const cuentas = await this.getMovimientosCuentas(desde, hasta);

    const ingresos = this.agruparPorTipo(cuentas, 'ingreso');
    const costos   = this.agruparPorTipo(cuentas, 'costo');
    const gastos   = this.agruparPorTipo(cuentas, 'gasto');

    const totalIngresos  = +this.subtotal(ingresos, 'ingreso').toFixed(2);
    const totalCostos    = +this.subtotal(costos,   'costo').toFixed(2);
    const totalGastos    = +this.subtotal(gastos,   'gasto').toFixed(2);
    const utilidadBruta  = +(totalIngresos - totalCostos).toFixed(2);
    const utilidadNeta   = +(utilidadBruta - totalGastos).toFixed(2);

    // ISR estimado (Ley 11-92 RD): 27% sobre utilidades netas positivas
    const isrEstimado = utilidadNeta > 0 ? +(utilidadNeta * 0.27).toFixed(2) : 0;
    const utilidadDespuesIsr = +(utilidadNeta - isrEstimado).toFixed(2);

    const margenBruto  = totalIngresos > 0 ? +((utilidadBruta  / totalIngresos) * 100).toFixed(1) : 0;
    const margenNeto   = totalIngresos > 0 ? +((utilidadNeta   / totalIngresos) * 100).toFixed(1) : 0;

    return {
      periodo: { desde, hasta },
      ingresos: {
        cuentas:       ingresos,
        total:         totalIngresos,
      },
      costos: {
        cuentas:       costos,
        total:         totalCostos,
      },
      gastos: {
        cuentas:       gastos,
        total:         totalGastos,
      },
      resultados: {
        utilidadBruta,
        totalGastos,
        utilidadNeta,
        isrEstimado,
        utilidadDespuesIsr,
        margenBruto,
        margenNeto,
      },
    };
  }

  // ─── Flujo de Caja simplificado ───────────────────────────────────────────────

  async flujoEfectivo(desde: string, hasta: string) {
    const cuentas = await this.getMovimientosCuentas(desde, hasta);

    // Efectivo (1.1.1.xx)
    const efectivo = cuentas.filter(c => c.codigo.startsWith('1.1.1'));
    const saldoInicial = 0; // Would need balance at 'desde - 1 day'

    // INNER JOINs: aqui el filtro por empresa va en el WHERE (no degrada nada).
    // Se filtran AMBOS lados — asiento y catalogo — y las fechas van parametrizadas.
    const eid = this.eid;

    const entradas = await this.dataSource.query<{ total: string }[]>(`
      SELECT COALESCE(SUM(al.haber), 0)::text AS total
      FROM asiento_lineas al
      JOIN asientos_contables ac ON ac.id = al."asientoId"
      JOIN cuentas_contables cc  ON cc.id  = al."cuentaContableId"
      WHERE cc.codigo LIKE '1.1.1%'
        AND ac.estado = 'contabilizado'
        AND ac.fecha  BETWEEN $2 AND $3
        AND ac."isActive" = true AND al."isActive" = true
        AND ac."empresaId" = $1
        AND cc."empresaId" = $1
    `, [eid, desde, hasta]);

    const salidas = await this.dataSource.query<{ total: string }[]>(`
      SELECT COALESCE(SUM(al.debe), 0)::text AS total
      FROM asiento_lineas al
      JOIN asientos_contables ac ON ac.id = al."asientoId"
      JOIN cuentas_contables cc  ON cc.id  = al."cuentaContableId"
      WHERE cc.codigo LIKE '1.1.1%'
        AND ac.estado = 'contabilizado'
        AND ac.fecha  BETWEEN $2 AND $3
        AND ac."isActive" = true AND al."isActive" = true
        AND ac."empresaId" = $1
        AND cc."empresaId" = $1
    `, [eid, desde, hasta]);

    const totalEntradas  = +(entradas[0]?.total ?? 0);
    const totalSalidas   = +(salidas[0]?.total ?? 0);
    const flujoNeto      = +(totalEntradas - totalSalidas).toFixed(2);

    return {
      periodo: { desde, hasta },
      saldoInicial,
      entradas: +totalEntradas.toFixed(2),
      salidas:  +totalSalidas.toFixed(2),
      flujoNeto,
      cuentasEfectivo: efectivo,
    };
  }

  // ─── Resumen ejecutivo ────────────────────────────────────────────────────────

  async resumenEjecutivo(desde: string, hasta: string, fechaBalance: string) {
    const [er, bg] = await Promise.all([
      this.estadoResultados(desde, hasta),
      this.balanceGeneral(fechaBalance),
    ]);

    return {
      periodo:     { desde, hasta, fechaBalance },
      ingresos:    er.ingresos.total,
      costos:      er.costos.total,
      gastos:      er.gastos.total,
      utilidadNeta: er.resultados.utilidadNeta,
      margenNeto:  er.resultados.margenNeto,
      activos:     bg.totales.activos,
      pasivos:     bg.pasivo.total,
      patrimonio:  bg.patrimonio.total,
      cuadrado:    bg.totales.cuadrado,
    };
  }

  // ─── Listado de asientos descuadrados ────────────────────────────────────────
  // Respalda la línea "Diferencia por asientos descuadrados" de Balance
  // General — el link al listado que muestra esa línea llega aquí.

  async asientosDescuadrados(hasta?: string) {
    return this.saldosCuentasService.obtenerAsientosDescuadrados(this.eid, hasta);
  }
}
