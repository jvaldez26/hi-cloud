import api from './client';
import type { FiltrosBalanceGeneral } from '../utils/filtrosBalanceGeneral';
import type { FiltrosEstadoResultados } from '../utils/filtrosEstadoResultados';
import type { FiltrosFlujoEfectivo } from '../utils/filtrosFlujoEfectivo';

export interface NodoBalanceGeneral {
  codigo: string;
  nombre: string;
  nivel: number;
  tipo: string;
  esCuentaGrupo: boolean;
  monto: number;
  porcentajeVertical: number;
  comparado?: number;
  diferencia?: number;
  diferenciaPct?: number | null;
  hijos: NodoBalanceGeneral[];
}

interface SeccionBalance {
  nodos: NodoBalanceGeneral[];
  total: number;
  comparado?: number;
  diferencia?: number;
  diferenciaPct?: number | null;
}

export interface BalanceGeneralDetallado {
  fechaCorte: string;
  filtros: {
    compararCon: FiltrosBalanceGeneral['compararCon'];
    fechaComparacion?: string;
    nivelDetalle: FiltrosBalanceGeneral['nivelDetalle'];
    ocultarCuentasEnCero: boolean;
  };
  activo: SeccionBalance;
  pasivo: SeccionBalance;
  patrimonio: SeccionBalance & {
    calculadas: {
      resultadoDelEjercicio: { desde: string; hasta: string; monto: number; comparado?: number };
      resultadosAcumulados:  { hasta: string; monto: number; comparado?: number };
    };
  };
  diferenciaAsientosDescuadrados: { total: number; cantidad: number };
  totales: { activos: number; pasivosPatrimonio: number; ecuacion: number; cuadrado: boolean };
}

// ── Estado de Resultados v2 ──────────────────────────────────────────────────

export interface LineaCuentaResultado {
  codigo: string;
  nombre: string;
  monto: number;
  porcentajeIngresos: number;
}

export interface BloqueResultado {
  nombre: string;
  cuentas: LineaCuentaResultado[];
  total: number;
  porcentajeIngresos: number;
}

export interface LineaCalculada {
  nombre: string;
  monto: number;
  porcentajeIngresos: number;
  porcentajeMargen: number | null;
}

export interface EstadoResultadosPeriodo {
  ingresos: BloqueResultado;
  costoDeVentas: BloqueResultado;
  utilidadBruta: LineaCalculada;
  gastos: BloqueResultado;
  resultadoOperacional: LineaCalculada;
  otrosIngresos: BloqueResultado;
  otrosGastos: BloqueResultado;
  gananciaPerdidaDelPeriodo: LineaCalculada;
}

export interface LineaDiferencia {
  actual: number;
  anterior: number;
  diferencia: number;
  diferenciaPct: number | null;
}

export interface DiferenciasEstadoResultados {
  ingresos: LineaDiferencia;
  costoDeVentas: LineaDiferencia;
  utilidadBruta: LineaDiferencia;
  gastos: LineaDiferencia;
  resultadoOperacional: LineaDiferencia;
  otrosIngresos: LineaDiferencia;
  otrosGastos: LineaDiferencia;
  gananciaPerdidaDelPeriodo: LineaDiferencia;
}

export interface MesEstadoResultados {
  mes: number;
  desde: string;
  hasta: string;
  periodo: EstadoResultadosPeriodo;
}

export interface EstadoResultadosDetallado {
  desde: string;
  hasta: string;
  filtros: { comparacion: FiltrosEstadoResultados['comparacion']; ocultarCuentasEnCero: boolean };
  periodo: EstadoResultadosPeriodo;
  acumulado?: { desde: string; hasta: string; periodo: EstadoResultadosPeriodo };
  anioAnterior?: { desde: string; hasta: string; periodo: EstadoResultadosPeriodo; diferencias: DiferenciasEstadoResultados };
  porMes?: { anio: number; meses: MesEstadoResultados[]; total: EstadoResultadosPeriodo };
}

// ── Estado de Flujo de Efectivo v2 ───────────────────────────────────────────

export interface CuentaFlujoEfectivo {
  codigo: string;
  nombre: string;
  monto: number;
}

export interface LineaFlujoEfectivo {
  nombre: string;
  monto: number;
  cuentas: CuentaFlujoEfectivo[];
}

export interface BloqueFlujoEfectivo {
  nombre: string;
  lineas: LineaFlujoEfectivo[];
  total: number;
}

export interface FlujoEfectivoPeriodo {
  resultadoNeto: number;
  operaciones: BloqueFlujoEfectivo;
  inversiones: BloqueFlujoEfectivo;
  financiamientos: BloqueFlujoEfectivo;
  cambioNetoEfectivo: number;
  efectivoInicio: number;
  efectivoFin: number;
  diferenciaCuadre: number;
  cuadrado: boolean;
}

export interface MesFlujoEfectivo {
  mes: number;
  desde: string;
  hasta: string;
  periodo: FlujoEfectivoPeriodo;
}

export interface FlujoEfectivoDetallado {
  desde: string;
  hasta: string;
  filtros: { comparacion: FiltrosFlujoEfectivo['comparacion'] };
  periodo: FlujoEfectivoPeriodo;
  acumulado?: { desde: string; hasta: string; periodo: FlujoEfectivoPeriodo };
  anioAnterior?: { desde: string; hasta: string; periodo: FlujoEfectivoPeriodo };
  porMes?: { anio: number; meses: MesFlujoEfectivo[]; total: FlujoEfectivoPeriodo };
}

function queryDeFiltrosFE(filtros: FiltrosFlujoEfectivo): string {
  const p = new URLSearchParams();
  p.set('desde', filtros.desde);
  p.set('hasta', filtros.hasta);
  if (filtros.comparacion !== 'ninguna') p.set('comparacion', filtros.comparacion);
  return p.toString();
}

function queryDeFiltrosER(filtros: FiltrosEstadoResultados): string {
  const p = new URLSearchParams();
  p.set('desde', filtros.desde);
  p.set('hasta', filtros.hasta);
  if (filtros.comparacion !== 'ninguna') p.set('comparacion', filtros.comparacion);
  p.set('ocultarCuentasEnCero', String(filtros.ocultarCuentasEnCero));
  return p.toString();
}

function queryDeFiltros(filtros: FiltrosBalanceGeneral): string {
  const p = new URLSearchParams();
  p.set('fechaCorte', filtros.fechaCorte);
  if (filtros.compararCon !== 'ninguno') p.set('compararCon', filtros.compararCon);
  if (filtros.compararCon === 'fecha-manual' && filtros.fechaComparacion) p.set('fechaComparacion', filtros.fechaComparacion);
  p.set('nivelDetalle', String(filtros.nivelDetalle));
  p.set('ocultarCuentasEnCero', String(filtros.ocultarCuentasEnCero));
  p.set('mostrarCodigo', String(filtros.mostrarCodigo));
  p.set('mostrarPorcentajeVertical', String(filtros.mostrarPorcentajeVertical));
  return p.toString();
}

/** Descarga un archivo protegido por cookie httpOnly — mismo patrón que ya usa ReportesFinancierosPage para el PDF. */
async function descargar(path: string, filename: string) {
  const empresaId = localStorage.getItem('empresaId') ?? '';
  const res = await fetch(`/api/v1${path}`, { headers: { 'X-Empresa-ID': empresaId }, credentials: 'include' });
  if (!res.ok) throw new Error('No se pudo generar el archivo');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const reportesFinancierosApi = {
  balanceGeneralDetallado: (filtros: FiltrosBalanceGeneral): Promise<BalanceGeneralDetallado> =>
    api.get(`/reportes-financieros/balance-general-detallado?${queryDeFiltros(filtros)}`)
      .then((r: any) => r.data?.data ?? r.data),

  descargarBalanceGeneralExcel: (filtros: FiltrosBalanceGeneral) =>
    descargar(`/reportes-financieros/balance-general-detallado/excel?${queryDeFiltros(filtros)}`, `Balance-General-${filtros.fechaCorte}.xlsx`),

  descargarBalanceGeneralCsv: (filtros: FiltrosBalanceGeneral) =>
    descargar(`/reportes-financieros/balance-general-detallado/csv?${queryDeFiltros(filtros)}`, `Balance-General-${filtros.fechaCorte}.csv`),

  descargarBalanceGeneralPdf: (filtros: FiltrosBalanceGeneral) =>
    descargar(`/reportes-financieros/balance-general-detallado/pdf?${queryDeFiltros(filtros)}`, `Balance-General-${filtros.fechaCorte}.pdf`),

  estadoResultadosDetallado: (filtros: FiltrosEstadoResultados): Promise<EstadoResultadosDetallado> =>
    api.get(`/reportes-financieros/estado-resultados-detallado?${queryDeFiltrosER(filtros)}`)
      .then((r: any) => r.data?.data ?? r.data),

  descargarEstadoResultadosExcel: (filtros: FiltrosEstadoResultados) =>
    descargar(`/reportes-financieros/estado-resultados-detallado/excel?${queryDeFiltrosER(filtros)}`, `Estado-Resultados-${filtros.desde}_${filtros.hasta}.xlsx`),

  descargarEstadoResultadosCsv: (filtros: FiltrosEstadoResultados) =>
    descargar(`/reportes-financieros/estado-resultados-detallado/csv?${queryDeFiltrosER(filtros)}`, `Estado-Resultados-${filtros.desde}_${filtros.hasta}.csv`),

  descargarEstadoResultadosPdf: (filtros: FiltrosEstadoResultados) =>
    descargar(`/reportes-financieros/estado-resultados-detallado/pdf?${queryDeFiltrosER(filtros)}`, `Estado-Resultados-${filtros.desde}_${filtros.hasta}.pdf`),

  flujoEfectivoDetallado: (filtros: FiltrosFlujoEfectivo): Promise<FlujoEfectivoDetallado> =>
    api.get(`/reportes-financieros/flujo-efectivo-detallado?${queryDeFiltrosFE(filtros)}`)
      .then((r: any) => r.data?.data ?? r.data),

  descargarFlujoEfectivoExcel: (filtros: FiltrosFlujoEfectivo) =>
    descargar(`/reportes-financieros/flujo-efectivo-detallado/excel?${queryDeFiltrosFE(filtros)}`, `Flujo-Efectivo-${filtros.desde}_${filtros.hasta}.xlsx`),

  descargarFlujoEfectivoCsv: (filtros: FiltrosFlujoEfectivo) =>
    descargar(`/reportes-financieros/flujo-efectivo-detallado/csv?${queryDeFiltrosFE(filtros)}`, `Flujo-Efectivo-${filtros.desde}_${filtros.hasta}.csv`),

  descargarFlujoEfectivoPdf: (filtros: FiltrosFlujoEfectivo) =>
    descargar(`/reportes-financieros/flujo-efectivo-detallado/pdf?${queryDeFiltrosFE(filtros)}`, `Flujo-Efectivo-${filtros.desde}_${filtros.hasta}.pdf`),
};
