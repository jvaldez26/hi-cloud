import api from './client';

/** Configuración Contable por Módulo (2026-09-19) — un concepto del motor de asientos, con su valor vigente. */
export interface ConceptoContableRow {
  concepto: string;
  label: string;
  grupo: string;
  default: string;
  valorActual: string;
  esDefault: boolean;
  cuenta: { id: number; codigo: string; nombre: string } | null;
  /** Presente cuando la cuenta configurada/default ya no existe, está inactiva, o no permite movimientos. */
  advertencia?: string;
}

export const configuracionContableApi = {
  listar: (): Promise<ConceptoContableRow[]> =>
    api.get<{ data: ConceptoContableRow[] }>('/contabilidad/configuracion').then(r => (r.data as any)?.data ?? r.data),

  actualizar: (concepto: string, cuentaCodigo: string) =>
    api.patch(`/contabilidad/configuracion/${concepto}`, { cuentaCodigo }).then(r => r.data),

  restaurar: (concepto: string) =>
    api.delete(`/contabilidad/configuracion/${concepto}`).then(r => r.data),
};
