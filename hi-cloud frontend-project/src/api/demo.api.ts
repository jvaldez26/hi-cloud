import api from './client';

export interface DemoPayload {
  nombre:        string;
  empresa:       string;
  email:         string;
  telefono:      string;
  pais?:         string;
  tamanoEmpresa: '1-5' | '6-20' | '21-100' | '100+';
  modulosInteres?: string[];
  mensaje?:      string;
}

export const ESTADO_DEMO_LABEL: Record<string, string> = {
  nuevo:          '🆕 Nuevo',
  contactado:     '📞 Contactado',
  demo_agendada:  '📅 Demo agendada',
  demo_realizada: '✅ Demo realizada',
  convertido:     '🏆 Convertido',
  descartado:     '❌ Descartado',
};

export const ESTADO_DEMO_COLOR: Record<string, string> = {
  nuevo:          'blue',
  contactado:     'orange',
  demo_agendada:  'cyan',
  demo_realizada: 'geekblue',
  convertido:     'green',
  descartado:     'red',
};

export const demoApi = {
  solicitar: (body: DemoPayload) =>
    api.post('/demo/solicitar', body).then(r => r.data?.data ?? r.data),

  listar: (p = 1, estado?: string, search?: string, desde?: string, hasta?: string) => {
    const params = new URLSearchParams({ page: String(p) });
    if (estado) params.set('estado', estado);
    if (search) params.set('search', search);
    if (desde)  params.set('desde',  desde);
    if (hasta)  params.set('hasta',  hasta);
    return api.get(`/demo?${params}`).then(r => r.data?.data ?? r.data);
  },

  estadisticas: () =>
    api.get('/demo/estadisticas').then(r => r.data?.data ?? r.data),

  actualizarEstado: (id: number, body: {
    estado?:       string;
    notasInternas?: string;
    asignadoA?:    string;
  }) => api.patch(`/demo/${id}/estado`, body).then(r => r.data?.data ?? r.data),

  agregarNota: (id: number, texto: string) =>
    api.post(`/demo/${id}/notas`, { texto }).then(r => r.data?.data ?? r.data),

  detalle: (id: number) =>
    api.get(`/demo/${id}`).then(r => r.data?.data ?? r.data),
};
