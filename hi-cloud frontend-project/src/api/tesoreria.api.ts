import api from './client';

export interface CuentaBancariaPayload {
  banco: string; numeroCuenta: string;
  tipoCuenta: string; moneda: string;
  saldoInicial?: number; descripcion?: string;
}

export const tesoreriaApi = {
  resumen: () =>
    api.get('/tesoreria/resumen').then(r => r.data.data),

  cuentas: () =>
    api.get('/tesoreria/cuentas').then(r => r.data.data),

  createCuenta: (body: CuentaBancariaPayload) =>
    api.post('/tesoreria/cuentas', body).then(r => r.data.data),

  movimientos: (p = 1, limit = 15, cuentaId?: number) =>
    api.get(`/tesoreria/movimientos?page=${p}&limit=${limit}${cuentaId ? `&cuentaBancariaId=${cuentaId}` : ''}`)
       .then(r => r.data.data),

  deposito: (body: { cuentaBancariaId: number; monto: number; fecha: string; descripcion: string; referencia?: string }) =>
    api.post('/tesoreria/movimientos/deposito', body).then(r => r.data.data),

  retiro: (body: { cuentaBancariaId: number; monto: number; fecha: string; descripcion: string; referencia?: string }) =>
    api.post('/tesoreria/movimientos/retiro', body).then(r => r.data.data),

  transferencia: (body: { cuentaOrigenId: number; cuentaDestinoId: number; monto: number; fecha: string; descripcion: string }) =>
    api.post('/tesoreria/movimientos/transferencia', body).then(r => r.data.data),

  flujoCaja: (desde: string, hasta: string) =>
    api.get(`/tesoreria/flujo-caja?fechaDesde=${desde}&fechaHasta=${hasta}`).then(r => r.data.data),

  flujoPorDia: (mes: number, anio: number) =>
    api.get(`/tesoreria/flujo-por-dia?mes=${mes}&anio=${anio}`).then(r => r.data.data),
};
