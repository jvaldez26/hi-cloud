import {
  IsInt,
  IsPositive,
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

// Mismo techo y mismo motivo que en registrar-entrada.dto — ver ese archivo.
// Aquí `cantidadNueva` es el stock RESULTANTE (no un delta), pero el mismo
// razonamiento aplica: nada en producción se acerca a esta cifra.
const CANTIDAD_MAXIMA_MOVIMIENTO = 1_000_000;

export class RegistrarAjusteDto {
  @IsInt()
  @IsPositive()
  productoId: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(CANTIDAD_MAXIMA_MOVIMIENTO)
  cantidadNueva: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;
}
