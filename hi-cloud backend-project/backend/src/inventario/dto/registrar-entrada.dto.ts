import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsNumber,
  Max,
  MaxLength,
} from 'class-validator';

// Techo muy por encima de cualquier entrada real vista en producción (el
// máximo histórico es 3,000) y muy por debajo de lo que soporta la columna
// productos.stock (numeric(12,4), hasta ~99.9 millones). Sin esto, un valor
// disparatado (typo, integración rota) no se rechaza aquí con un 400 claro:
// llega intacto hasta el UPDATE y revienta en Postgres con "numeric field
// overflow" — Sentry #7712819145.
const CANTIDAD_MAXIMA_MOVIMIENTO = 1_000_000;

export class RegistrarEntradaDto {
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
