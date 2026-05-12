import {
  IsInt, IsPositive, IsDateString, IsNumber,
  IsString, Matches, IsOptional,
} from 'class-validator';

export class CreateConciliacionDto {
  @IsInt() @IsPositive()
  cuentaBancariaId: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Período debe tener formato YYYY-MM' })
  periodo: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  saldoExtracto: number;

  @IsOptional() @IsString()
  notas?: string;
}
