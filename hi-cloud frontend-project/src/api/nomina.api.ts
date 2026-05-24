import api from './client';

export interface EmpleadoPayload {
  cedula: string; nombre: string; apellido: string;
  fechaNacimiento: string; fechaIngreso: string;
  cargo: string; salarioBase: number;
  tipoPago: string; tipoContrato: string;
  departamento?: string; email?: string; telefono?: string;
  banco?: string; cuentaBancaria?: string;
  otrasDeduccionesFixed?: number;
}

export interface PeriodoPayload {
  periodo: string;
  fechaInicio: string; fechaFin: string; fechaPago: string;
  diasPeriodo?: number;
}

export interface NovedadPayload {
  empleadoId: number;
  periodoId?: number;
  tipo: 'bono' | 'horas_extras' | 'ausencia' | 'descuento' | 'otro';
  descripcion: string;
  monto?: number;
  horasExtras?: number;
}

export interface ContratoPayload {
  empleadoId: number;
  numero?: string;
  tipo: 'indefinido' | 'fijo' | 'temporal';
  fechaInicio: string;
  fechaFin?: string;
  salario: number;
  cargo: string;
  departamento?: string;
  clausulas?: string;
  lugarTrabajo?: string;
  horasSemana?: number;
}

export const nominaApi = {
  // ── Empleados ─────────────────────────────────────────────────────────────
  empleados: (p = 1, limit = 10, search = '', estado?: string) =>
    api.get(`/nomina/empleados?page=${p}&limit=${limit}&search=${search}${estado ? `&estado=${estado}` : ''}`)
       .then(r => r.data.data),

  createEmpleado: (body: EmpleadoPayload) =>
    api.post('/nomina/empleados', body).then(r => r.data.data),

  updateEmpleado: (id: number, body: Partial<EmpleadoPayload>) =>
    api.patch(`/nomina/empleados/${id}`, body).then(r => r.data.data),

  removeEmpleado: (id: number) =>
    api.delete(`/nomina/empleados/${id}`).then(r => r.data.data),

  getPrestaciones: (id: number) =>
    api.get(`/nomina/empleados/${id}/prestaciones`).then(r => r.data.data),

  getHistorial: (id: number) =>
    api.get(`/nomina/empleados/${id}/historial`).then(r => r.data.data),

  // ── Novedades ─────────────────────────────────────────────────────────────
  novedades: (empleadoId?: number, periodoId?: number, soloSinAplicar = false) => {
    const params = new URLSearchParams();
    if (empleadoId)    params.set('empleadoId',     String(empleadoId));
    if (periodoId)     params.set('periodoId',       String(periodoId));
    if (soloSinAplicar) params.set('soloSinAplicar', 'true');
    return api.get(`/nomina/novedades?${params}`).then(r => r.data.data);
  },

  createNovedad: (body: NovedadPayload) =>
    api.post('/nomina/novedades', body).then(r => r.data.data),

  deleteNovedad: (id: number) =>
    api.delete(`/nomina/novedades/${id}`).then(r => r.data.data),

  // ── Contratos Laborales ───────────────────────────────────────────────────
  contratos: (empleadoId?: number) => {
    const params = empleadoId ? `?empleadoId=${empleadoId}` : '';
    return api.get(`/nomina/contratos${params}`).then(r => r.data.data);
  },

  createContrato: (body: ContratoPayload) =>
    api.post('/nomina/contratos', body).then(r => r.data.data),

  findContrato: (id: number) =>
    api.get(`/nomina/contratos/${id}`).then(r => r.data.data),

  updateContrato: (id: number, body: { estado?: string; clausulas?: string; fechaFin?: string }) =>
    api.patch(`/nomina/contratos/${id}`, body).then(r => r.data.data),

  // ── Períodos ─────────────────────────────────────────────────────────────
  periodos: (p = 1, limit = 10, estado?: string) =>
    api.get(`/nomina/periodos?page=${p}&limit=${limit}${estado ? `&estado=${estado}` : ''}`)
       .then(r => r.data.data),

  createPeriodo: (body: PeriodoPayload) =>
    api.post('/nomina/periodos', body).then(r => r.data.data),

  findPeriodo: (id: number) =>
    api.get(`/nomina/periodos/${id}`).then(r => r.data.data),

  getLineas: (id: number) =>
    api.get(`/nomina/periodos/${id}/lineas`).then(r => r.data.data),

  getRecibo: (periodoId: number, empleadoId: number) =>
    api.get(`/nomina/periodos/${periodoId}/recibo/${empleadoId}`).then(r => r.data.data),

  getReciboPdf: async (periodoId: number, empleadoId: number): Promise<Blob> => {
    try {
      const res = await api.get(
        `/nomina/periodos/${periodoId}/recibo/${empleadoId}/pdf`,
        { responseType: 'blob' },
      );
      return res.data as Blob;
    } catch (err: any) {
      // Con responseType:'blob' las respuestas de error también llegan como Blob.
      // Las parseamos de vuelta a JSON para que e.response.data.message funcione.
      if (err.response?.data instanceof Blob) {
        try {
          const text  = await (err.response.data as Blob).text();
          err.response.data = JSON.parse(text);
        } catch { /* si no es JSON, dejarlo como está */ }
      }
      throw err;
    }
  },

  procesarPeriodo: (id: number) =>
    api.patch(`/nomina/periodos/${id}/procesar`).then(r => r.data.data),

  pagarPeriodo: (id: number) =>
    api.patch(`/nomina/periodos/${id}/pagar`).then(r => r.data.data),

  anularPeriodo: (id: number) =>
    api.patch(`/nomina/periodos/${id}/anular`).then(r => r.data.data),

  descargarArchivoBanco: async (periodoId: number, periodo: string) => {
    // JWT en httpOnly cookie — credentials: 'include' la envía automáticamente
    const res = await fetch(`/api/v1/nomina/periodos/${periodoId}/archivo-banco`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Error generando archivo de banco');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Nomina-Banco-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // ── Utilidades ────────────────────────────────────────────────────────────
  tasas: () => api.get('/nomina/tasas-tss').then(r => r.data.data),

  simular: (salario: number, dias = 30, otras = 0, horasExtras = 0) =>
    api.get(`/nomina/simular?salario=${salario}&diasTrabajados=${dias}&otrasDeduciones=${otras}&horasExtras=${horasExtras}`)
       .then(r => r.data.data),

  resumen: () => api.get('/nomina/resumen').then(r => r.data.data),
};
