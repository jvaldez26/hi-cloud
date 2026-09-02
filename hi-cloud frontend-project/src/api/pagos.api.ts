import { apiClient } from './client';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ResumenSuscripcion {
  plan:             string;
  estado:           string;
  modalidad:        string;
  precioMensual:    number;
  fechaInicio:      string;
  fechaVencimiento: string;
  diasRestantes:    number;
  diasTotales:      number;
  porcentajeUsado:  number;
  saldo:            number;
}

/**
 * Qué haría un pago: cuántos períodos cubre y qué vencimiento deja.
 *
 * Lo calcula el BACKEND (preview-pago.util.ts), con la misma fórmula que
 * aplica al confirmar. El frontend lo tuvo duplicado y prometía en un
 * Popconfirm un vencimiento que el servidor volvía a calcular a su manera.
 */
export interface PreviewPago {
  /** Períodos completos que cubre el pago. 0 = queda como abono. */
  periodos:         number;
  precioPorPeriodo: number;
  /** Vencimiento resultante, 'YYYY-MM-DD'. null si no cubre ni un período. */
  nuevaFecha:       string | null;
  /** Lo que falta para completar un período. 0 si ya lo cubre. */
  faltante:         number;
  /** El nuevo vencimiento sigue en el pasado: venía muy atrasada. */
  enPasado:         boolean;
  /** El plan no tiene precio configurado: no hay nada que calcular. */
  sinPrecio:        boolean;
  /** Solo en el preview en vivo: la empresa no tiene suscripción. */
  sinSuscripcion?:  boolean;
}

export interface PagoSuscripcion {
  id:             number;
  empresaId:      number;
  tipo:           'TARJETA' | 'TRANSFERENCIA' | 'MANUAL' | 'CREDITO' | 'CARGO';
  concepto:       string;
  monto:          number;
  estado:         'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
  comprobanteUrl: string | null;
  referencia:     string | null;
  notas:          string | null;
  motivoRechazo:  string | null;
  periodoInicio:  string | null;
  periodoFin:     string | null;
  creadoEn:       string;
  confirmadoEn:   string | null;
  // joins (admin)
  empresaNombre?:    string;
  empresaEmail?:     string;
  rnc?:              string;
  plan?:             string;
  estadoSuscripcion?: string;
  venceSuscripcion?:  string;
  diaCorte?:          number;
  modalidad?:         string;
  precioMensual?:     number;
  /** Solo en comprobantes-pendientes: qué haría confirmar este pago. */
  preview?:           PreviewPago | null;
}

export interface ConfiguracionBancaria {
  id:           number;
  banco:        string;
  numeroCuenta: string;
  tipoCuenta:   string;
  titular:      string;
  rnc:          string | null;
}

/**
 * Un ciclo CERRADO con excedente de e-CF sin cobrar.
 *
 * Todas las cifras las calcula el servidor. El panel las pinta; no recalcula
 * nada, y el botón solo devuelve el ciclo.
 */
export interface ExcedenteEcf {
  empresaId:  number;
  empresa:    string;
  plan:       string;
  planNombre: string;
  ciclo:      { inicio: string; fin: string };
  emitidos:   number;
  cupo:       number;
  excedente:  number;
  precioUnitario: number;
  monto:      number;
}

export interface ResumenCobros {
  empresaId:              number;
  nombre:                 string;
  email:                  string;
  plan:                   string;
  estadoSuscripcion:      string;
  modalidad:              string;
  diaCorte:               number;
  venceSuscripcion:       string;
  saldo:                  number;
  precioMensual:          number;
  ultimoPago:             string | null;
  pendientesConfirmacion: number;
}

// ── Cliente (empresa) ──────────────────────────────────────────────────────────

const BASE = '/pagos-suscripcion';

// Desempaqueta la envoltura { success, data, timestamp } del ResponseInterceptor global
function unwrap<T>(r: any): T {
  return r?.data?.data ?? r?.data ?? r;
}

export const pagosApi = {
  /** Resumen plan + días restantes + saldo */
  resumen: (): Promise<ResumenSuscripcion> =>
    apiClient.get(`${BASE}/resumen`).then(r => unwrap<ResumenSuscripcion>(r)),

  /** Historial de cargos, pagos y créditos */
  historial: (): Promise<PagoSuscripcion[]> =>
    apiClient.get(`${BASE}/historial`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /** Datos bancarios de HiCloud para realizar transferencia */
  configuracionBancaria: (): Promise<ConfiguracionBancaria | null> =>
    apiClient.get(`${BASE}/configuracion-bancaria`).then(r => unwrap<ConfiguracionBancaria | null>(r)),

  /** Subir comprobante de transferencia */
  subirComprobante: (
    file: File,
    monto: number,
    referencia?: string,
    banco?: string,
    notas?: string,
  ): Promise<PagoSuscripcion> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('monto', String(monto));
    if (referencia) fd.append('referencia', referencia);
    if (banco)      fd.append('banco', banco);
    if (notas)      fd.append('notas', notas);
    return apiClient.post(`${BASE}/comprobante`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

// ── Super Admin ────────────────────────────────────────────────────────────────

const ADMIN = '/admin/pagos-suscripcion';

export const pagosAdminApi = {
  /** Lista todos los pagos (opcional: filtro por estado) */
  listar: (estado?: string): Promise<PagoSuscripcion[]> =>
    apiClient.get(ADMIN, { params: estado ? { estado } : {} }).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /** Resumen de cobros por empresa */
  resumenCobros: (): Promise<ResumenCobros[]> =>
    apiClient.get(`${ADMIN}/resumen-cobros`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /** Ciclos cerrados con excedente de e-CF que todavía no se han cobrado */
  excedentesEcf: (): Promise<ExcedenteEcf[]> =>
    apiClient.get(`${ADMIN}/excedentes-ecf`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /**
   * Genera el cargo por el excedente de un ciclo.
   *
   * Se manda SOLO el ciclo. El monto no viaja: el servidor recuenta los
   * comprobantes y relee el precio al cobrar. Mismo criterio que el preview de
   * pago — el cliente no calcula dinero, muestra lo que llega.
   */
  cargoExcedenteEcf: (empresaId: number, cicloInicio: string) =>
    apiClient.post(`${ADMIN}/empresa/${empresaId}/cargo-excedente-ecf`, { cicloInicio })
      .then(r => unwrap<any>(r)),

  /** Comprobantes de transferencia pendientes de confirmación */
  comprobantesPendientes: (): Promise<PagoSuscripcion[]> =>
    apiClient.get(`${ADMIN}/comprobantes-pendientes`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /**
   * Qué haría un pago de `monto` en esa empresa. Se pide al servidor en vez
   * de calcularlo aquí: es la misma cuenta que se va a aplicar al registrar.
   */
  previewPago: (empresaId: number, monto: number): Promise<PreviewPago> =>
    apiClient.get(`${ADMIN}/empresa/${empresaId}/preview-pago`, { params: { monto } })
      .then(r => unwrap<PreviewPago>(r)),

  /** Historial completo de una empresa */
  historialEmpresa: (empresaId: number): Promise<PagoSuscripcion[]> =>
    apiClient.get(`${ADMIN}/empresa/${empresaId}`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

  /** Registrar pago manual */
  registrarPago: (empresaId: number, data: {
    tipo: string; concepto: string; monto: number;
    referencia?: string; notas?: string;
    periodoInicio?: string; periodoFin?: string;
  }): Promise<PagoSuscripcion> =>
    apiClient.post(`${ADMIN}/empresa/${empresaId}/pago`, data).then(r => r.data),

  /** Agregar cargo adicional */
  agregarCargo: (empresaId: number, data: {
    concepto: string; monto: number; notas?: string;
  }): Promise<PagoSuscripcion> =>
    apiClient.post(`${ADMIN}/empresa/${empresaId}/cargo`, data).then(r => r.data),

  /** Aplicar crédito / descuento */
  aplicarCredito: (empresaId: number, data: {
    concepto: string; monto: number; notas?: string;
  }): Promise<PagoSuscripcion> =>
    apiClient.post(`${ADMIN}/empresa/${empresaId}/credito`, data).then(r => r.data),

  /** Confirmar transferencia */
  confirmar: (pagoId: number, notas?: string): Promise<PagoSuscripcion> =>
    apiClient.patch(`${ADMIN}/${pagoId}/confirmar`, { notas }).then(r => r.data),

  /** Rechazar transferencia */
  rechazar: (pagoId: number, motivoRechazo: string): Promise<{ ok: boolean }> =>
    apiClient.patch(`${ADMIN}/${pagoId}/rechazar`, { motivoRechazo }).then(r => r.data),

  /** Enviar recordatorio de pago */
  enviarRecordatorio: (empresaId: number): Promise<{ ok: boolean; mensaje: string }> =>
    apiClient.post(`${ADMIN}/empresa/${empresaId}/recordatorio`).then(r => r.data),

  /** Obtener configuración bancaria */
  getConfigBancaria: (): Promise<ConfiguracionBancaria | null> =>
    apiClient.get(`${ADMIN}/config-bancaria`).then(r => unwrap<ConfiguracionBancaria | null>(r)),

  /** Actualizar configuración bancaria */
  updateConfigBancaria: (data: {
    banco: string; numeroCuenta: string; tipoCuenta?: string;
    titular: string; rnc?: string;
  }): Promise<ConfiguracionBancaria> =>
    apiClient.patch(`${ADMIN}/config-bancaria`, data).then(r => r.data),
};
