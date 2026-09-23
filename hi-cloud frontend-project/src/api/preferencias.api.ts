import api from './client';

export type WidgetCatalogo = { slug: string; titulo: string };

export type RespuestaWidgets = {
  /** Slugs activos, en el orden en que se muestran. */
  widgets:    string[];
  /**
   * `true` = nunca ha elegido y está viendo las de fábrica.
   * `false` = es una decisión suya, aunque la lista venga vacía.
   *
   * Sin este flag no se puede distinguir "acabo de entrar por primera vez" de
   * "las quité todas a propósito", y al segundo le reaparecerían en cada carga.
   */
  porDefecto: boolean;
  /** Catálogo ya filtrado por el rol que el usuario tiene en esta empresa. */
  catalogo:   WidgetCatalogo[];
};

export type RespuestaColumnas = {
  /** El usuario las escondió (venían visibles por defecto). */
  ocultas:    string[];
  /** El usuario las sacó (venían ocultas por defecto). */
  mostradas:  string[];
  /** `true` = nunca ha tocado el selector en ningún dispositivo. */
  porDefecto: boolean;
};

export const preferenciasApi = {
  getDashboardWidgets: (): Promise<RespuestaWidgets> =>
    api.get('/preferencias/dashboard-widgets').then((r: any) => r.data?.data ?? r.data),

  setDashboardWidgets: (widgets: string[]): Promise<{ widgets: string[] }> =>
    api.put('/preferencias/dashboard-widgets', { widgets }).then((r: any) => r.data?.data ?? r.data),

  getColumnas: (modulo: string): Promise<RespuestaColumnas> =>
    api.get(`/preferencias/columnas/${modulo}`).then((r: any) => r.data?.data ?? r.data),

  setColumnas: (modulo: string, ocultas: string[], mostradas: string[]): Promise<{ ocultas: string[]; mostradas: string[] }> =>
    api.put(`/preferencias/columnas/${modulo}`, { ocultas, mostradas }).then((r: any) => r.data?.data ?? r.data),
};
