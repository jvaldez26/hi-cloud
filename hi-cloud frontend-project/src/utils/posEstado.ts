/**
 * Canal de comunicación POS → componentes globales.
 *
 * Mutable singleton intencional: el POS actualiza el flag cuando abre o
 * cierra el modal de cobro; el MensajeNotificador lo consulta antes de
 * mostrar una notificación para no interrumpir una venta en curso.
 *
 * No es estado de React — el notificador lo lee puntualmente en cada
 * tick de su intervalo de verificación (1 s), sin necesitar reactivity.
 */
export const posEstado = {
  /** true mientras el modal de cobro / pago del POS está abierto */
  modalCobroAbierto: false,
};
