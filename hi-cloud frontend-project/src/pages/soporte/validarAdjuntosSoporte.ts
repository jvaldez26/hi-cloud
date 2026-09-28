import { MAX_ADJUNTOS_POR_TICKET, MAX_BYTES_POR_ADJUNTO, TIPOS_ADJUNTO_PERMITIDOS } from '../../api/soporte.api';

export interface AdjuntoRechazado {
  archivo: File;
  motivo:  string;
}

export interface ResultadoValidacionAdjuntos {
  aceptados:  File[];
  rechazados: AdjuntoRechazado[];
}

/**
 * Filtra archivos NUEVOS contra los ya seleccionados, respetando el máximo
 * total de MAX_ADJUNTOS_POR_TICKET. No valida el contenido real (magic
 * bytes) — eso es responsabilidad exclusiva del backend (ver
 * SoporteAdjuntosService); aquí solo se descarta lo obvio (tipo declarado,
 * tamaño, cupo) para no gastar ancho de banda subiendo algo que el
 * servidor va a rechazar de todas formas.
 */
export function validarNuevosAdjuntos(yaSeleccionados: File[], nuevos: File[]): ResultadoValidacionAdjuntos {
  const aceptados: File[] = [];
  const rechazados: AdjuntoRechazado[] = [];
  let total = yaSeleccionados.length;

  for (const archivo of nuevos) {
    if (total >= MAX_ADJUNTOS_POR_TICKET) {
      rechazados.push({ archivo, motivo: `Máximo ${MAX_ADJUNTOS_POR_TICKET} imágenes por ticket` });
      continue;
    }
    if (!(TIPOS_ADJUNTO_PERMITIDOS as readonly string[]).includes(archivo.type)) {
      rechazados.push({ archivo, motivo: 'Solo se permiten imágenes PNG, JPG o WEBP' });
      continue;
    }
    if (archivo.size > MAX_BYTES_POR_ADJUNTO) {
      rechazados.push({ archivo, motivo: 'Pesa más de 5 MB' });
      continue;
    }
    aceptados.push(archivo);
    total++;
  }

  return { aceptados, rechazados };
}
