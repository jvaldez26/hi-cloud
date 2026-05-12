import api from './client';

export interface CuentaPayload {
  codigo: string; nombre: string;
  tipo: string; naturaleza: string;
  nivel: number; permiteMovimientos: boolean;
  cuentaPadreId?: number; descripcion?: string;
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
  cuentas: (soloMovimientos?: boolean) =>
    api.get(`/contabilidad/cuentas${soloMovimientos ? '?soloMovimientos=true' : ''}`)
       .then(r => r.data.data),

  createCuenta: (body: CuentaPayload) =>
    api.post('/contabilidad/cuentas', body).then(r => r.data.data),

  updateCuenta: (id: number, body: Partial<CuentaPayload>) =>
    api.patch(`/contabilidad/cuentas/${id}`, body).then(r => r.data.data),

  asientos: (p = 1, limit = 10, estado?: string) =>
    api.get(`/contabilidad/asientos?page=${p}&limit=${limit}${estado ? `&estado=${estado}` : ''}`)
       .then(r => r.data.data),

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
