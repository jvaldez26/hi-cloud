import { IsDateString, IsNotEmpty, IsString, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

export class DarDeBajaDto {
  @IsDateString()
  fecha: string;

  @IsString() @MaxLength(2000) @IsNotEmpty()
  motivo: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorVenta?: number;
}
