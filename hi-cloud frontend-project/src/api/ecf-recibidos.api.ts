import api from './client';

export const ecfRecibidosApi = {
  listar: (opts: {
    page?: number;
    limit?: number;
    desde?: string;
    hasta?: string;
    rncEmisor?: string;
    tipoEcf?: string;
    status?: string;
    exportar?: boolean;
  } = {}) => {
    const params = new URLSearchParams();
    if (opts.page)      params.set('page',      String(opts.page));
    if (opts.limit)     params.set('limit',      String(opts.limit));
    if (opts.desde)     params.set('desde',      opts.desde);
    if (opts.hasta)     params.set('hasta',      opts.hasta);
    if (opts.rncEmisor) params.set('rncEmisor',  opts.rncEmisor);
    if (opts.tipoEcf)   params.set('tipoEcf',    opts.tipoEcf);
    if (opts.status)    params.set('status',     opts.status);
    if (opts.exportar)  params.set('exportar',   'true');
    return api.get(`/ecf-recibidos?${params.toString()}`).then(r => r.data.data ?? r.data);
  },

  importarCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/ecf-recibidos/importar-csv', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data ?? r.data);
  },
};
