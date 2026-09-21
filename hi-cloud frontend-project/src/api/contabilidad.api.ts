import api from './client';

/** Un elemento de la lista de anexos IR-2 de una cuenta (Fase 4 Bloque A). */
export interface EtiquetaAnexoIR2 {
  anexoIR2: 'A1' | 'B1' | 'D';
  casillaIR2?: string | null;
}

export interface CuentaPayload {
  codigo: string; nombre: string;
  tipo: string; naturaleza: string;
  nivel: number; permiteMovimientos: boolean;
  cuentaPadreId?: number; descripcion?: string;
  /**
   * Etiquetas fiscales (Fase 1 — catálogo fiscal dominicano 606/IR-2).
   * El backend solo las acepta en cuentas de movimiento de tipo gasto o
   * costo; ver ContabilidadService.validarPadreYEtiquetas().
   */
  tipoGasto606?: string | null;
  /**
   * FASE 4 Bloque A — una cuenta puede aportar a varios anexos del IR-2 a
   * la vez (ya no es un solo par anexoIR2/casillaIR2). Cada PATCH/POST
   * reemplaza la lista entera: [] la vacía, omitir el campo la deja igual.
   */
  etiquetasAnexoIR2?: EtiquetaAnexoIR2[];
  requiereNCF?: boolean | null;
}

/** Cuenta tal como la devuelve el backend — trae los anexos ya resueltos (attachAnexos()). */
export interface CuentaConAnexos extends CuentaPayload {
  id: number;
  esCuentaSistema?: boolean;
  anexosIR2: EtiquetaAnexoIR2[];
  /** Presente cuando el backend hizo el JOIN — usado para la columna "Cuenta madre" en modo filtrado. */
  cuentaPadre?: { id: number; codigo: string; nombre: string } | null;
}

export type ClasificacionCuenta = 'todas' | 'activos' | 'pasivos' | 'capital' | 'ingresos' | 'costos' | 'gastos';
export type EstadoCuenta = 'todas' | 'activas' | 'inactivas' | 'grupo';

export interface ConteosCuentas {
  clasificacion: Record<ClasificacionCuenta, number>;
  estado: Record<EstadoCuenta, number>;
}

export interface CuentasFiltradas {
  data: CuentaConAnexos[];
  conteos: ConteosCuentas;
}

export interface AsientoLineaPayload {
  cuentaContableId: number; descripcion: string;
  debe: number; haber: number;
}

export interface AsientoPayload {
  fecha: string; descripcion: string;
  lineas: AsientoLineaPayload[];
  referenciaFolio?: string;
}

export const contabilidadApi = {
  /** Cuentas de movimiento sin etiqueta fiscal completa — lista de trabajo del contador (Fase 2). */
  cuentasSinEtiquetar: () =>
    api.get('/contabilidad/cuentas/sin-etiquetar').then(r => r.data.data),

  cuentas: (opts: { soloMovimientos?: boolean; search?: string; clasificacion?: ClasificacionCuenta; estado?: EstadoCuenta } = {}) => {
    const params: Record<string, string> = {};
    if (opts.soloMovimientos) params.soloMovimientos = 'true';
    if (opts.search?.trim()) params.search = opts.search.trim();
    if (opts.clasificacion && opts.clasificacion !== 'todas') params.clasificacion = opts.clasificacion;
    if (opts.estado && opts.estado !== 'activas') params.estado = opts.estado;
    return api.get('/contabilidad/cuentas', { params }).then(r => r.data.data as CuentasFiltradas);
  },

  createCuenta: (body: CuentaPayload) =>
    api.post('/contabilidad/cuentas', body).then(r => r.data.data),

  updateCuenta: (id: number, body: Partial<CuentaPayload>) =>
    api.patch(`/contabilidad/cuentas/${id}`, body).then(r => r.data.data),

  asientos: (p = 1, limit = 10, estado?: string, desde?: string, hasta?: string, tipo?: string) => {
    const params: Record<string, any> = { page: p, limit };
    if (estado) params.estado = estado;
    if (desde)  params.fechaDesde = desde;
    if (hasta)  params.fechaHasta = hasta;
    if (tipo)   params.tipoOrigen = tipo;
    return api.get('/contabilidad/asientos', { params }).then(r => r.data.data);
  },

  createAsiento: (body: AsientoPayload) =>
    api.post('/contabilidad/asientos', body).then(r => r.data.data),

  findAsiento: (id: number) =>
    api.get(`/contabilidad/asientos/${id}`).then(r => r.data.data),

  contabilizar: (id: number) =>
    api.patch(`/contabilidad/asientos/${id}/contabilizar`).then(r => r.data.data),

  anularAsiento: (id: number) =>
    api.patch(`/contabilidad/asientos/${id}/anular`).then(r => r.data.data),

  balanceComprobacion: (desde?: string, hasta?: string) =>
    api.get(`/contabilidad/balance-comprobacion${desde ? `?fechaDesde=${desde}&fechaHasta=${hasta}` : ''}`)
       .then(r => r.data.data),

  balanceGeneral: (hasta?: string) =>
    api.get(`/contabilidad/balance-general${hasta ? `?fechaHasta=${hasta}` : ''}`)
       .then(r => r.data.data),

  estadoResultados: (desde?: string, hasta?: string) =>
    api.get(`/contabilidad/estado-resultados${desde ? `?fechaDesde=${desde}&fechaHasta=${hasta}` : ''}`)
       .then(r => r.data.data),

  libroMayor: (cuentaId: number, desde?: string, hasta?: string) =>
    api.get(`/contabilidad/libro-mayor/${cuentaId}${desde ? `?fechaDesde=${desde}&fechaHasta=${hasta}` : ''}`)
       .then(r => r.data.data),
};
