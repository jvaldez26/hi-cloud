import { IsNumber, IsPositive, IsDateString, IsString, IsNotEmpty } from 'class-validator';

export class CalcularAjusteInflacionDto {
  @IsNumber() @IsPositive()
  costoFiscal!: number;

  @IsDateString()
  fechaAdquisicion!: string;

  @IsDateString()
  fechaEnajenacion!: string;

  @IsString() @IsNotEmpty()
  categoria!: string;

  @IsNumber() @IsPositive()
  valorEnajenacion!: number;
}
