import { create } from 'zustand';

/**
 * Compartido entre tres piezas que no se conocen entre sí directamente:
 *  - El componente global que reproduce el sonido/parpadea el título
 *    (montado siempre en App.tsx).
 *  - SolicitudesAutorizacionPage.tsx — al expandir una fila para ver el
 *    detalle, esa solicitud se marca "vista" y deja de sonar/parpadear.
 *  - La sección de Perfil — activa/desactiva el sonido y lo prueba. Vive
 *    en el store (no en localStorage leído una sola vez) para que cambiarlo
 *    desde Perfil surta efecto AL INSTANTE en el componente global, que ya
 *    está montado en la misma pestaña (SPA, sin recarga de página).
 */
interface AutorizacionRemotaSonidoState {
  vistas: Set<number>;
  marcarVista: (id: number) => void;
  preferencia: 'on' | 'off' | null;
  setPreferencia: (v: 'on' | 'off' | null) => void;
  /** true desde que el AudioContext quedó 'running' por primera vez en esta
   *  pestaña — sobrevive la navegación (el store no depende de la ruta), así
   *  que el aviso "Toca para activar el sonido" nunca reaparece por haber
   *  cambiado de pantalla, solo porque el audio de verdad siga bloqueado. */
  audioDesbloqueado: boolean;
  setAudioDesbloqueado: (v: boolean) => void;
}

export const useAutorizacionRemotaSonidoStore = create<AutorizacionRemotaSonidoState>((set, get) => ({
  vistas: new Set(),
  marcarVista: (id) => {
    if (get().vistas.has(id)) return; // evita un Set nuevo (y re-render) si ya estaba marcada
    set({ vistas: new Set(get().vistas).add(id) });
  },
  preferencia: null,
  setPreferencia: (v) => set({ preferencia: v }),
  audioDesbloqueado: false,
  setAudioDesbloqueado: (v) => set({ audioDesbloqueado: v }),
}));
