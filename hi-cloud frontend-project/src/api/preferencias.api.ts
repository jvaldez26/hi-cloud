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

export const preferenciasApi = {
  getDashboardWidgets: (): Promise<RespuestaWidgets> =>
    api.get('/preferencias/dashboard-widgets').then((r: any) => r.data?.data ?? r.data),

  setDashboardWidgets: (widgets: string[]): Promise<{ widgets: string[] }> =>
    api.put('/preferencias/dashboard-widgets', { widgets }).then((r: any) => r.data?.data ?? r.data),
};
