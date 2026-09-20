import { IsNumber, IsPositive, IsDateString, IsIn, IsBoolean } from 'class-validator';
import type { Situacion } from '../recargos-intereses.calculo';

const SITUACIONES: Situacion[] = [
  'normal', 'rectificacionVoluntaria', 'aceptaEnAuditoria', 'pagoTras30diasResolucion', 'desisteRecurso',
];

export class CalcularRecargosInteresesDto {
  @IsNumber() @IsPositive()
  montoAdeudado!: number;

  @IsDateString()
  fechaLimite!: string;

  @IsDateString()
  fechaPago!: string;

  @IsIn(SITUACIONES)
  situacion!: Situacion;

  @IsBoolean()
  acogeAmnistia!: boolean;
}
