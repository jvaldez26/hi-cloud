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
}

export interface ConfiguracionBancaria {
  id:           number;
  banco:        string;
  numeroCuenta: string;
  tipoCuenta:   string;
  titular:      string;
  rnc:          string | null;
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

  /** Comprobantes de transferencia pendientes de confirmación */
  comprobantesPendientes: (): Promise<PagoSuscripcion[]> =>
    apiClient.get(`${ADMIN}/comprobantes-pendientes`).then(r => {
      const raw = unwrap<any>(r);
      return Array.isArray(raw) ? raw : [];
    }),

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
