import { BadRequestException } from '@nestjs/common';

/**
 * Bloquea escritura académica sobre un período cerrado — es lo que le da
 * validez al boletín impreso: una vez cerrado (ed_periodos.estado =
 * 'cerrado'), ni las evaluaciones, ni las calificaciones, ni la
 * consolidación de notaFinal pueden cambiar. Compartido entre
 * academico.service.ts (evaluaciones/calificaciones) y
 * boletines.service.ts (consolidación) — un solo lugar donde vive la regla.
 */
export function assertPeriodoAbierto(periodo: { estado: string; nombre?: string } | undefined | null): void {
  if (!periodo) return; // periodoId opcional en algunos caminos (p.ej. evaluación sin período) — nada que bloquear
  if (periodo.estado === 'cerrado') {
    throw new BadRequestException(
      `El período "${periodo.nombre ?? ''}" está cerrado — las notas ya no se pueden editar.`,
    );
  }
}
