import api from './client';

const r = (res: any) => res.data?.data ?? res.data;

export const wmsApi = {
  getUbicaciones: (almacenId?: number) =>
    api.get('/wms/ubicaciones', { params: almacenId ? { almacenId } : {} }).then(r),
};
