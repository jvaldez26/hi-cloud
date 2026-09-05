import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsNumber,
  Max,
  MaxLength,
} from 'class-validator';

// Mismo techo y mismo motivo que en registrar-entrada.dto — ver ese archivo.
const CANTIDAD_MAXIMA_MOVIMIENTO = 1_000_000;

export class RegistrarSalidaDto {
  @IsInt()
  @IsPositive()
  productoId: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(CANTIDAD_MAXIMA_MOVIMIENTO)
  cantidad: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  almacenId?: number;
}
