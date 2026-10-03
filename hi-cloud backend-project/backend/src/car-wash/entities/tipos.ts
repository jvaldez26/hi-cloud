export type TipoVehiculoCw = 'carro' | 'jeepeta' | 'camioneta' | 'moto' | 'camion';

export const TIPOS_VEHICULO_CW: TipoVehiculoCw[] = ['carro', 'jeepeta', 'camioneta', 'moto', 'camion'];

export type EstadoTurnoCw = 'en_espera' | 'en_lavado' | 'secado' | 'listo' | 'entregado' | 'cancelado';

export const ESTADOS_TURNO_CW: EstadoTurnoCw[] = [
  'en_espera', 'en_lavado', 'secado', 'listo', 'entregado', 'cancelado',
];

export type CobroEnCw = 'recepcion' | 'entrega';

export type ModoPagoLavadorCw = 'por_vehiculo' | 'porcentaje' | 'por_servicio';

export const MODOS_PAGO_LAVADOR_CW: ModoPagoLavadorCw[] = ['por_vehiculo', 'porcentaje', 'por_servicio'];
