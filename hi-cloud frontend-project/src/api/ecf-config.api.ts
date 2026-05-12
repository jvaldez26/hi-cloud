import api from './client';

const BASE = '/admin/ecf-config';

export interface EmpresaEcfConfigPayload {
  empresaId:          number;
  msellerEmail:       string;
  msellerPassword:    string;
  msellerApiKey:      string;
  msellerUrlBase?:    string;
  modo?:              'TEST' | 'CERTIFICACION' | 'PRODUCCION';
  rncEmisor:          string;
  razonSocialEmisor:  string;
  nombreComercial?:   string;
  direccionEmisor?:   string;
  municipio?:         string;
  provincia?:         string;
}

export interface SecuenciaPayload {
  empresaId:         number;
  tipoECFId:         number;
  secuenciaInicial:  number;
  secuenciaFinal:    number;
  fechaVencimiento:  string;
}

export const ecfConfigApi = {
  dashboard:   () => api.get(`${BASE}/dashboard`).then(r => r.data.data ?? r.data),
  listar:      () => api.get(`${BASE}/empresas`).then(r => r.data.data ?? r.data),
  obtener:     (empresaId: number) => api.get(`${BASE}/empresas/${empresaId}`).then(r => r.data.data ?? r.data),
  crear:       (dto: EmpresaEcfConfigPayload) => api.post(`${BASE}/empresas`, dto).then(r => r.data.data ?? r.data),
  actualizar:  (empresaId: number, dto: Partial<EmpresaEcfConfigPayload> & { activo?: boolean }) =>
                 api.patch(`${BASE}/empresas/${empresaId}`, dto).then(r => r.data.data ?? r.data),
  eliminar:    (empresaId: number) => api.delete(`${BASE}/empresas/${empresaId}`),
  testConexion:(empresaId: number) => api.post(`${BASE}/empresas/${empresaId}/test-conexion`).then(r => r.data.data ?? r.data),
  listarSeqs:  (empresaId: number) => api.get(`${BASE}/empresas/${empresaId}/secuencias`).then(r => r.data.data ?? r.data),
  crearSeq:    (dto: SecuenciaPayload) => api.post(`${BASE}/secuencias`, dto).then(r => r.data.data ?? r.data),
  desactivarSeq:(id: number) => api.patch(`${BASE}/secuencias/${id}/desactivar`).then(r => r.data.data ?? r.data),
};
