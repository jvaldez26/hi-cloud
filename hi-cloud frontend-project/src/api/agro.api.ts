import api from './client';

const base = '/agro';
const r = (res: any) => res.data?.data ?? res.data;

export const agroApi = {
  // Dashboard
  getDashboard: () => api.get(`${base}/dashboard`).then(r),

  // Fincas
  getFincas: () => api.get(`${base}/fincas`).then(r),
  getFinca: (id: number) => api.get(`${base}/fincas/${id}`).then(r),
  crearFinca: (body: any) => api.post(`${base}/fincas`, body).then(r),
  updateFinca: (id: number, body: any) => api.patch(`${base}/fincas/${id}`, body).then(r),
  getParcelasByFinca: (id: number) => api.get(`${base}/fincas/${id}/parcelas`).then(r),

  // Parcelas
  getParcelas: () => api.get(`${base}/parcelas`).then(r),
  crearParcela: (body: any) => api.post(`${base}/parcelas`, body).then(r),
  updateParcela: (id: number, body: any) => api.patch(`${base}/parcelas/${id}`, body).then(r),

  // Cultivos
  getCultivos: () => api.get(`${base}/cultivos`).then(r),
  crearCultivo: (body: any) => api.post(`${base}/cultivos`, body).then(r),
  updateCultivo: (id: number, body: any) => api.patch(`${base}/cultivos/${id}`, body).then(r),

  // Ciclos
  getCiclos: (params?: any) => api.get(`${base}/ciclos`, { params }).then(r),
  getCiclo: (id: number) => api.get(`${base}/ciclos/${id}`).then(r),
  crearCiclo: (body: any) => api.post(`${base}/ciclos`, body).then(r),
  updateCiclo: (id: number, body: any) => api.patch(`${base}/ciclos/${id}`, body).then(r),
  cerrarCiclo: (id: number, body: any) => api.post(`${base}/ciclos/${id}/cerrar`, body).then(r),
  getCostosCiclo: (id: number) => api.get(`${base}/ciclos/${id}/costos`).then(r),
  getRentabilidadCiclo: (id: number) => api.get(`${base}/ciclos/${id}/rentabilidad`).then(r),
  getLaboresCiclo: (id: number) => api.get(`${base}/ciclos/${id}/labores`).then(r),
  getAplicacionesCiclo: (id: number) => api.get(`${base}/ciclos/${id}/aplicaciones`).then(r),

  // Labores
  crearLabor: (body: any) => api.post(`${base}/labores`, body).then(r),
  updateLabor: (id: number, body: any) => api.patch(`${base}/labores/${id}`, body).then(r),

  // Aplicaciones de insumos
  crearAplicacion: (body: any) => api.post(`${base}/aplicaciones`, body).then(r),

  // Cosechas
  getCosechas: (params?: any) => api.get(`${base}/cosechas`, { params }).then(r),
  getCosecha: (id: number) => api.get(`${base}/cosechas/${id}`).then(r),
  crearCosecha: (body: any) => api.post(`${base}/cosechas`, body).then(r),
  ingresarInventario: (id: number, body?: any) => api.post(`${base}/cosechas/${id}/ingresar-inventario`, body).then(r),

  // Ganadería — Animales
  getAnimales: (params?: any) => api.get(`${base}/animales`, { params }).then(r),
  getAnimal: (id: number) => api.get(`${base}/animales/${id}`).then(r),
  crearAnimal: (body: any) => api.post(`${base}/animales`, body).then(r),
  updateAnimal: (id: number, body: any) => api.patch(`${base}/animales/${id}`, body).then(r),
  getEventosAnimal: (id: number) => api.get(`${base}/animales/${id}/eventos`).then(r),
  crearEventoAnimal: (id: number, body: any) => api.post(`${base}/animales/${id}/eventos`, body).then(r),
  getGenealogia: (id: number) => api.get(`${base}/animales/${id}/genealogia`).then(r),

  // Ganadería — general
  getProduccionLeche: (params?: any) => api.get(`${base}/ganaderia/produccion-leche`, { params }).then(r),
  getCalendarioSanitario: () => api.get(`${base}/ganaderia/calendario-sanitario`).then(r),

  // Insumos
  getInsumos: (params?: any) => api.get(`${base}/insumos`, { params }).then(r),
  crearInsumo: (body: any) => api.post(`${base}/insumos`, body).then(r),
  updateInsumo: (id: number, body: any) => api.patch(`${base}/insumos/${id}`, body).then(r),

  // Maquinaria
  getMaquinaria: () => api.get(`${base}/maquinaria`).then(r),
  crearMaquinaria: (body: any) => api.post(`${base}/maquinaria`, body).then(r),
  updateMaquinaria: (id: number, body: any) => api.patch(`${base}/maquinaria/${id}`, body).then(r),

  // PDFs
  pdfTrazabilidad: (cicloId: number) => `${api.defaults.baseURL}${base}/pdf/trazabilidad/${cicloId}`,
  pdfCostos: (cicloId: number) => `${api.defaults.baseURL}${base}/pdf/costos/${cicloId}`,
  pdfAnimal: (animalId: number) => `${api.defaults.baseURL}${base}/pdf/animal/${animalId}`,
  pdfInventarioInsumos: () => `${api.defaults.baseURL}${base}/pdf/inventario-insumos`,

  // Reportes CSV
  descargarReporte: async (tipo: string, nombre: string, params?: Record<string, any>) => {
    const res = await api.get(`${base}/reportes/${tipo}`, { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${nombre}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  },
};
