import { IsNumber, IsPositive, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AjustarCostoManualDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  costo: number;

  @IsString() @MaxLength(2000) @IsNotEmpty()
  motivo: string;
}
