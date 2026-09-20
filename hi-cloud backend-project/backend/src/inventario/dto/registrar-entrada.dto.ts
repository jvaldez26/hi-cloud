import {
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  IsNumber,
  Max,
  Min,
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

  /**
   * Costo unitario de esta entrada — opcional. Si se manda (>0), actualiza
   * costoPromedio (AVCO) igual que una Compra recibida. Si se omite, el
   * movimiento se registra como siempre (solo mueve stock, sin tocar costo).
   *
   * @Min(0), no @IsPositive(): un 0 escrito a mano debe ACEPTARSE y quedar
   * ignorado (misma guarda que actualizarCostoPromedio — costo <= 0 no toca
   * el promedio), no rechazarse con un 400 que bloquee toda la entrada.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costoUnitario?: number;
}
