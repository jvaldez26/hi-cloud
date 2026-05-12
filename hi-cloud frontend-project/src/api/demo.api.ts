import api from './client';

export interface DemoPayload {
  nombre: string;
  empresa: string;
  email: string;
  telefono: string;
  pais?: string;
  tamanoEmpresa: '1-5' | '6-20' | '21-100' | '100+';
  modulosInteres?: string[];
  mensaje?: string;
}

export const demoApi = {
  solicitar: (body: DemoPayload) =>
    api.post('/demo/solicitar', body).then(r => r.data.data),

  listar: (p = 1, estado?: string) =>
    api.get(`/demo?page=${p}${estado ? `&estado=${estado}` : ''}`).then(r => r.data.data),

  estadisticas: () =>
    api.get('/demo/estadisticas').then(r => r.data.data),

  actualizarEstado: (id: number, body: { estado?: string; notasInternas?: string; asignadoA?: string }) =>
    api.patch(`/demo/${id}/estado`, body).then(r => r.data.data),
};
