import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaContable } from '../contabilidad/entities/cuenta-contable.entity';
import { TenantService } from '../tenant/tenant.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { CuentaClasificable } from './clasificacion-resultado.util';
import { construirEstadoResultados, EstadoResultadosPeriodo } from './estado-resultados-bloques.util';

export type ComparacionEstadoResultados = 'ninguna' | 'mes-vs-acumulado' | 'anio-anterior' | 'por-mes';

export interface FiltrosEstadoResultadosDetallado {
  desde:                 string;
  hasta:                 string;
  comparacion?:          ComparacionEstadoResultados;
  ocultarCuentasEnCero?: boolean;
}

interface FiltrosNormalizados {
  desde:                 string;
  hasta:                 string;
  comparacion:           ComparacionEstadoResultados;
  ocultarCuentasEnCero:  boolean;
}

export interface LineaDiferencia {
  actual:         number;
  anterior:       number;
  diferencia:     number;
  diferenciaPct:  number | null; // null solo si anterior=0 y actual≠0 — nunca Infinity/NaN
}

export interface DiferenciasEstadoResultados {
  ingresos:                   LineaDiferencia;
  costoDeVentas:               LineaDiferencia;
  utilidadBruta:               LineaDiferencia;
  gastos:                      LineaDiferencia;
  resultadoOperacional:        LineaDiferencia;
  otrosIngresos:               LineaDiferencia;
  otrosGastos:                 LineaDiferencia;
  gananciaPerdidaDelPeriodo:   LineaDiferencia;
}

export interface MesEstadoResultados {
  mes:      number; // 1-12
  desde:    string;
  hasta:    string;
  periodo:  EstadoResultadosPeriodo;
}

export interface EstadoResultadosDetallado {
  desde:   string;
  hasta:   string;
  filtros: { comparacion: ComparacionEstadoResultados; ocultarCuentasEnCero: boolean };
  periodo: EstadoResultadosPeriodo;
  acumulado?:   { desde: string; hasta: string; periodo: EstadoResultadosPeriodo };
  anioAnterior?: { desde: string; hasta: string; periodo: EstadoResultadosPeriodo; diferencias: DiferenciasEstadoResultados };
  porMes?: { anio: number; meses: MesEstadoResultados[]; total: EstadoResultadosPeriodo };
}

const COMPARACIONES_VALIDAS: ComparacionEstadoResultados[] = ['ninguna', 'mes-vs-acumulado', 'anio-anterior', 'por-mes'];

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Misma fecha, un año antes — 29-feb sin equivalente cae en 28-feb (mismo criterio que BalanceGeneralDetalladoService.resolverFechaComparacion). */
function shiftUnAnioAtras(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const anioAnt = y - 1;
  const dia = Math.min(d, ultimoDiaMes(anioAnt, m));
  return `${anioAnt}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Estado de Resultados v2 (2026-09-21) — orquesta SaldosCuentasService +
 * el catálogo (para resolver clasificacionResultado con herencia, UNA vez
 * por request) y compone el resultado con estado-resultados-bloques.util.ts
 * (función pura, sin DB, ya probada a fondo aparte). Este servicio solo
 * decide QUÉ rangos de fecha pedir según el modo de comparación — nunca
 * recalcula bloques ni porcentajes por su cuenta.
 *
 * 4 modos de comparación (ninguno de los 4 cambia periodo.gananciaPerdidaDelPeriodo,
 * que siempre es el resultado del rango desde/hasta principal):
 *   - mes-vs-acumulado: el rango principal ("Mes") + el año en curso desde
 *     el 1-ene hasta la misma fecha "hasta" ("Acumulado").
 *   - anio-anterior: el mismo rango desplazado exactamente 1 año atrás, más
 *     Diferencia/% por línea.
 *   - por-mes: los 12 meses del año de "hasta" + una columna Total (calculada
 *     con una sola consulta anual, no sumando los 12 meses) — meses futuros
 *     de un ejercicio incompleto simplemente no tienen movimientos, sin caso
 *     especial (SaldosCuentasService ya devuelve saldos=0/vacío para un rango
 *     sin asientos).
 */
@Injectable()
export class EstadoResultadosDetalladoService {
  constructor(
    @InjectRepository(CuentaContable)
    private readonly cuentaRepo: Repository<CuentaContable>,
    private readonly tenantSvc: TenantService,
    private readonly saldosCuentasService: SaldosCuentasService,
  ) {}

  /** FALLA CERRADO — misma convención que BalanceGeneralDetalladoService. */
  private get eid(): number {
    const id = this.tenantSvc.getEmpresaIdOrNull();
    if (!id) throw new TenantContextMissingException('CuentaContable', 'EstadoResultadosDetalladoService');
    return id;
  }

  normalizarFiltros(filtros: FiltrosEstadoResultadosDetallado): FiltrosNormalizados {
    if (!filtros.desde || !filtros.hasta) throw new BadRequestException('desde y hasta son requeridas');
    if (filtros.desde > filtros.hasta) throw new BadRequestException('desde no puede ser posterior a hasta');

    const comparacion = filtros.comparacion ?? 'ninguna';
    if (!COMPARACIONES_VALIDAS.includes(comparacion)) {
      throw new BadRequestException(`comparacion inválida: ${comparacion}`);
    }

    return {
      desde: filtros.desde,
      hasta: filtros.hasta,
      comparacion,
      ocultarCuentasEnCero: filtros.ocultarCuentasEnCero ?? true,
    };
  }

  private async catalogoClasificable(eid: number): Promise<CuentaClasificable[]> {
    const cuentas = await this.cuentaRepo.find({ where: { isActive: true, empresaId: eid } as any });
    return cuentas.map(c => ({
      id: c.id, codigo: c.codigo,
      clasificacionResultado: c.clasificacionResultado ?? null,
      cuentaPadreId: c.cuentaPadreId ?? null,
    }));
  }

  private async periodo(
    eid: number, catalogo: CuentaClasificable[], desde: string, hasta: string, ocultarCeros: boolean,
  ): Promise<EstadoResultadosPeriodo> {
    const saldos = await this.saldosCuentasService.obtenerSaldos(eid, desde, hasta);
    return construirEstadoResultados(saldos, catalogo, ocultarCeros);
  }

  private compararLineas(actual: EstadoResultadosPeriodo, anterior: EstadoResultadosPeriodo): DiferenciasEstadoResultados {
    const linea = (a: number, b: number): LineaDiferencia => {
      const diferencia = +(a - b).toFixed(2);
      const diferenciaPct = b !== 0 ? +((diferencia / Math.abs(b)) * 100).toFixed(1) : (a === 0 ? 0 : null);
      return { actual: a, anterior: b, diferencia, diferenciaPct };
    };
    return {
      ingresos:                  linea(actual.ingresos.total, anterior.ingresos.total),
      costoDeVentas:              linea(actual.costoDeVentas.total, anterior.costoDeVentas.total),
      utilidadBruta:              linea(actual.utilidadBruta.monto, anterior.utilidadBruta.monto),
      gastos:                     linea(actual.gastos.total, anterior.gastos.total),
      resultadoOperacional:       linea(actual.resultadoOperacional.monto, anterior.resultadoOperacional.monto),
      otrosIngresos:              linea(actual.otrosIngresos.total, anterior.otrosIngresos.total),
      otrosGastos:                linea(actual.otrosGastos.total, anterior.otrosGastos.total),
      gananciaPerdidaDelPeriodo:  linea(actual.gananciaPerdidaDelPeriodo.monto, anterior.gananciaPerdidaDelPeriodo.monto),
    };
  }

  async generar(filtrosCrudos: FiltrosEstadoResultadosDetallado): Promise<EstadoResultadosDetallado> {
    const eid = this.eid;
    const filtros = this.normalizarFiltros(filtrosCrudos);
    const { desde, hasta, comparacion, ocultarCuentasEnCero } = filtros;

    // empresaId explícito por la misma razón que BalanceGeneralDetalladoService:
    // un caller sin CLS activo (cron, script) no debe poder mezclar catálogos.
    const catalogo = await this.catalogoClasificable(eid);
    const periodoPrincipal = await this.periodo(eid, catalogo, desde, hasta, ocultarCuentasEnCero);

    const resultado: EstadoResultadosDetallado = {
      desde, hasta, filtros: { comparacion, ocultarCuentasEnCero }, periodo: periodoPrincipal,
    };

    if (comparacion === 'mes-vs-acumulado') {
      const anio = Number(hasta.slice(0, 4));
      const acumuladoDesde = `${anio}-01-01`;
      const periodoAcumulado = await this.periodo(eid, catalogo, acumuladoDesde, hasta, ocultarCuentasEnCero);
      resultado.acumulado = { desde: acumuladoDesde, hasta, periodo: periodoAcumulado };
    } else if (comparacion === 'anio-anterior') {
      const desdeAnt = shiftUnAnioAtras(desde);
      const hastaAnt = shiftUnAnioAtras(hasta);
      const periodoAnterior = await this.periodo(eid, catalogo, desdeAnt, hastaAnt, ocultarCuentasEnCero);
      resultado.anioAnterior = {
        desde: desdeAnt, hasta: hastaAnt, periodo: periodoAnterior,
        diferencias: this.compararLineas(periodoPrincipal, periodoAnterior),
      };
    } else if (comparacion === 'por-mes') {
      const anio = Number(hasta.slice(0, 4));
      const inicioAnio = `${anio}-01-01`;
      const finAnio = `${anio}-12-31`;

      const meses = await Promise.all(Array.from({ length: 12 }, (_, i) => i + 1).map(async (mes) => {
        const desdeMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const hastaMes = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDiaMes(anio, mes)).padStart(2, '0')}`;
        const periodoMes = await this.periodo(eid, catalogo, desdeMes, hastaMes, ocultarCuentasEnCero);
        return { mes, desde: desdeMes, hasta: hastaMes, periodo: periodoMes };
      }));
      const total = await this.periodo(eid, catalogo, inicioAnio, finAnio, ocultarCuentasEnCero);
      resultado.porMes = { anio, meses, total };
    }

    return resultado;
  }

  /**
   * Ganancia (Pérdida) del Período para un rango dado — usado por el test de
   * consistencia contra BalanceGeneralDetalladoService.resultadoNeto() (misma
   * fórmula, mismo origen de saldos, deben coincidir SIEMPRE a la misma fecha).
   */
  async gananciaPerdidaDelPeriodo(desde: string, hasta: string): Promise<number> {
    const eid = this.eid;
    const catalogo = await this.catalogoClasificable(eid);
    const periodo = await this.periodo(eid, catalogo, desde, hasta, true);
    return periodo.gananciaPerdidaDelPeriodo.monto;
  }
}
