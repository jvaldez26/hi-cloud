import { EstadoTurnoCw } from './entities/tipos';

/** Estados desde los que todavía se puede cancelar (antes de ENTREGADO). */
const ESTADOS_CANCELABLES: EstadoTurnoCw[] = ['en_espera', 'en_lavado', 'secado', 'listo'];

/**
 * Transiciones permitidas desde un estado dado. `usaSecado` decide si
 * EN_LAVADO salta a SECADO o directo a LISTO (la etapa de secado es
 * opcional por configuración de la sucursal).
 */
export function transicionesPermitidas(estado: EstadoTurnoCw, usaSecado: boolean): EstadoTurnoCw[] {
  const siguientes: EstadoTurnoCw[] = (() => {
    switch (estado) {
      case 'en_espera': return ['en_lavado'];
      case 'en_lavado':  return usaSecado ? ['secado'] : ['listo'];
      case 'secado':     return ['listo'];
      case 'listo':      return ['entregado'];
      case 'entregado':  return [];
      case 'cancelado':  return [];
    }
  })();

  if (ESTADOS_CANCELABLES.includes(estado)) return [...siguientes, 'cancelado'];
  return siguientes;
}

export function transicionValida(actual: EstadoTurnoCw, destino: EstadoTurnoCw, usaSecado: boolean): boolean {
  return transicionesPermitidas(actual, usaSecado).includes(destino);
}

/** Columna de timestamp que corresponde a cada estado, para registrar en cw_turnos. */
export const COLUMNA_TIMESTAMP_POR_ESTADO: Record<EstadoTurnoCw, string> = {
  en_espera: 'enEsperaAt',
  en_lavado: 'enLavadoAt',
  secado: 'secadoAt',
  listo: 'listoAt',
  entregado: 'entregadoAt',
  cancelado: 'canceladoAt',
};
