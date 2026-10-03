export type TipoVehiculoCw = 'carro' | 'jeepeta' | 'camioneta' | 'moto' | 'camion';

export const TIPOS_VEHICULO_CW: TipoVehiculoCw[] = ['carro', 'jeepeta', 'camioneta', 'moto', 'camion'];

export const LABEL_TIPO_VEHICULO_CW: Record<TipoVehiculoCw, string> = {
  carro: 'Carro', jeepeta: 'Jeepeta', camioneta: 'Camioneta', moto: 'Moto', camion: 'Camión',
};

export type EstadoTurnoCw = 'en_espera' | 'en_lavado' | 'secado' | 'listo' | 'entregado' | 'cancelado';

export const ESTADOS_TURNO_CW: EstadoTurnoCw[] = ['en_espera', 'en_lavado', 'secado', 'listo', 'entregado', 'cancelado'];

export const LABEL_ESTADO_CW: Record<EstadoTurnoCw, string> = {
  en_espera: 'En espera', en_lavado: 'En lavado', secado: 'Secado',
  listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado',
};

/** Mismos colores que ESTADO_TAG de XlinkPage — consistencia visual entre módulos. */
export const COLOR_ESTADO_CW: Record<EstadoTurnoCw, string> = {
  en_espera: 'default', en_lavado: 'blue', secado: 'blue',
  listo: 'green', entregado: 'green', cancelado: 'red',
};

export type ModoPagoLavadorCw = 'por_vehiculo' | 'porcentaje' | 'por_servicio';

export const LABEL_MODO_PAGO_CW: Record<ModoPagoLavadorCw, string> = {
  por_vehiculo: 'Monto fijo por vehículo',
  porcentaje: '% del subtotal',
  por_servicio: 'Tarifa por servicio',
};
