import { IsNumber, IsPositive, IsDateString, IsIn, IsOptional } from 'class-validator';
import type { TamanoEmpresa } from '../anticipos-isr.calculo';

const TAMANOS_EMPRESA: TamanoEmpresa[] = ['microempresa', 'pequena', 'personaFisica', 'medianaGrande'];

export class CalcularAnticiposISRDto {
  @IsNumber() @IsPositive()
  isrEjercicioAnterior!: number;

  @IsDateString()
  fechaInicioEjercicio!: string;

  @IsOptional()
  @IsIn(TAMANOS_EMPRESA)
  tamanoEmpresa?: TamanoEmpresa;
}
