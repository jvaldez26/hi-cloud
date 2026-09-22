import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { TenantContextMissingException } from '../tenant/exceptions/tenant-context-missing.exception';
import { SaldosCuentasService } from './saldos-cuentas.service';
import { construirFlujoEfectivo, FlujoEfectivoPeriodo } from './flujo-efectivo-bloques.util';

export type ComparacionFlujoEfectivo = 'ninguna' | 'mes-vs-acumulado' | 'anio-anterior' | 'por-mes';

export interface FiltrosFlujoEfectivoDetallado {
  desde:        string;
  hasta:        string;
  comparacion?: ComparacionFlujoEfectivo;
}

interface FiltrosNormalizadas {
  desde:        string;
  hasta:        string;
  comparacion:  ComparacionFlujoEfectivo;
}

export interface MesFlujoEfectivo {
  mes:      number;
  desde:    string;
  hasta:    string;
  periodo:  FlujoEfectivoPeriodo;
}

export interface FlujoEfectivoDetallado {
  desde:   string;
  hasta:   string;
  filtros: { comparacion: ComparacionFlujoEfectivo };
  periodo: FlujoEfectivoPeriodo;
  acumulado?:    { desde: string; hasta: string; periodo: FlujoEfectivoPeriodo };
  anioAnterior?: { desde: string; hasta: string; periodo: FlujoEfectivoPeriodo };
  porMes?:       { anio: number; meses: MesFlujoEfectivo[]; total: FlujoEfectivoPeriodo };
}

const COMPARACIONES_VALIDAS: ComparacionFlujoEfectivo[] = ['ninguna', 'mes-vs-acumulado', 'anio-anterior', 'por-mes'];

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Misma fecha, un año antes — 29-feb sin equivalente cae en 28-feb (mismo criterio que BalanceGeneralDetalladoService/EstadoResultadosDetalladoService). */
function shiftUnAnioAtras(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const anioAnt = y - 1;
  const dia = Math.min(d, ultimoDiaMes(anioAnt, m));
  return `${anioAnt}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Un día antes de `fecha` (para el punto de corte de "saldo inicial" del período). */
function diaAnterior(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Estado de Flujo de Efectivo v2, método indirecto (2026-09-22) — mismo
 * patrón de orquestación que EstadoResultadosDetalladoService: este
 * servicio solo decide QUÉ rangos de fecha pedir según el modo de
 * comparación (idéntico a Estado de Resultados — mismo enum, mismo
 * significado, reutilizado tal cual en vez de inventar un eje nuevo) y arma
 * el resultado con flujo-efectivo-bloques.util.ts (función pura, sin DB, ya
 * probada aparte con la "regla de oro").
 *
 * Por cada período pide TRES fotos a SaldosCuentasService (única fuente de
 * verdad, igual que Balance General/Estado de Resultados):
 *   - saldo acumulado al día ANTERIOR a "desde" (apertura del período)
 *   - saldo acumulado a "hasta" (cierre del período)
 *   - movimiento DENTRO de [desde, hasta] (para Resultado Neto y Depreciación)
 */
@Injectable()
export class FlujoEfectivoDetalladoService {
  constructor(
    private readonly tenantSvc: TenantService,
    private readonly saldosCuentasService: SaldosCuentasService,
  ) {}

  /** FALLA CERRADO — misma convención que BalanceGeneralDetalladoService/EstadoResultadosDetalladoService. */
  private get eid(): number {
    const id = this.tenantSvc.getEmpresaIdOrNull();
    if (!id) throw new TenantContextMissingException('CuentaContable', 'FlujoEfectivoDetalladoService');
    return id;
  }

  normalizarFiltros(filtros: FiltrosFlujoEfectivoDetallado): FiltrosNormalizadas {
    if (!filtros.desde || !filtros.hasta) throw new BadRequestException('desde y hasta son requeridas');
    if (filtros.desde > filtros.hasta) throw new BadRequestException('desde no puede ser posterior a hasta');

    const comparacion = filtros.comparacion ?? 'ninguna';
    if (!COMPARACIONES_VALIDAS.includes(comparacion)) {
      throw new BadRequestException(`comparacion inválida: ${comparacion}`);
    }

    return { desde: filtros.desde, hasta: filtros.hasta, comparacion };
  }

  private async periodo(eid: number, desde: string, hasta: string): Promise<FlujoEfectivoPeriodo> {
    const [saldosInicio, saldosFin, saldosPeriodo] = await Promise.all([
      this.saldosCuentasService.obtenerSaldos(eid, undefined, diaAnterior(desde)),
      this.saldosCuentasService.obtenerSaldos(eid, undefined, hasta),
      this.saldosCuentasService.obtenerSaldos(eid, desde, hasta),
    ]);
    return construirFlujoEfectivo(saldosInicio, saldosFin, saldosPeriodo);
  }

  async generar(filtrosCrudos: FiltrosFlujoEfectivoDetallado): Promise<FlujoEfectivoDetallado> {
    const eid = this.eid;
    const filtros = this.normalizarFiltros(filtrosCrudos);
    const { desde, hasta, comparacion } = filtros;

    const periodoPrincipal = await this.periodo(eid, desde, hasta);
    const resultado: FlujoEfectivoDetallado = {
      desde, hasta, filtros: { comparacion }, periodo: periodoPrincipal,
    };

    if (comparacion === 'mes-vs-acumulado') {
      const anio = Number(hasta.slice(0, 4));
      const acumuladoDesde = `${anio}-01-01`;
      resultado.acumulado = { desde: acumuladoDesde, hasta, periodo: await this.periodo(eid, acumuladoDesde, hasta) };
    } else if (comparacion === 'anio-anterior') {
      const desdeAnt = shiftUnAnioAtras(desde);
      const hastaAnt = shiftUnAnioAtras(hasta);
      resultado.anioAnterior = { desde: desdeAnt, hasta: hastaAnt, periodo: await this.periodo(eid, desdeAnt, hastaAnt) };
    } else if (comparacion === 'por-mes') {
      const anio = Number(hasta.slice(0, 4));
      const inicioAnio = `${anio}-01-01`;
      const finAnio = `${anio}-12-31`;

      const meses = await Promise.all(Array.from({ length: 12 }, (_, i) => i + 1).map(async (mes) => {
        const desdeMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const hastaMes = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDiaMes(anio, mes)).padStart(2, '0')}`;
        return { mes, desde: desdeMes, hasta: hastaMes, periodo: await this.periodo(eid, desdeMes, hastaMes) };
      }));
      resultado.porMes = { anio, meses, total: await this.periodo(eid, inicioAnio, finAnio) };
    }

    return resultado;
  }
}
