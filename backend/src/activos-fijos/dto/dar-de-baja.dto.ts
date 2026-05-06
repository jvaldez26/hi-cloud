import { IsDateString, IsNotEmpty, IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class DarDeBajaDto {
  @IsDateString()
  fecha: string;

  @IsString() @IsNotEmpty()
  motivo: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorVenta?: number;
}
