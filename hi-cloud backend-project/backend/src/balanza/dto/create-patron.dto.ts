import {
  IsString, IsNotEmpty, IsIn, IsInt, IsBoolean, IsOptional,
  Min, Max, MaxLength, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PREFIJOS_BALANZA } from '../utils/balanza-parser';

export class CreatePatronDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  /**
   * '2' o '20'…'99'. Fuente única: PREFIJOS_BALANZA (balanza-parser.ts).
   *
   * 20-29 es el bloque reservado por GS1 para uso interno. 30-99 se admite
   * porque hay balanzas configuradas de fábrica fuera de ese bloque, pero
   * puede capturar EAN-13 de fabricante: el formulario avisa al elegirlo.
   */
  @IsString()
  @IsIn(PREFIJOS_BALANZA)
  prefijo!: string;

  @IsInt()
  @Min(4)
  @Max(6)
  @Type(() => Number)
  longitudPlu!: number;

  @IsString()
  @IsIn(['peso', 'precio'])
  tipoDato!: 'peso' | 'precio';

  @IsInt()
  @Min(3)
  @Max(8)
  @Type(() => Number)
  longitudValor!: number;

  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  decimalesValor!: number;

  /**
   * Obligatorio cuando tipoDato = 'peso'. Debe coincidir exactamente con
   * el campo unidadMedida del producto al escanear (case-insensitive).
   */
  @ValidateIf(o => o.tipoDato === 'peso')
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unidadPeso?: string;

  @IsBoolean()
  @Type(() => Boolean)
  tieneCheckValor!: boolean;

  @IsInt()
  @IsIn([12, 13])
  @Type(() => Number)
  longitudTotal!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32767)
  @Type(() => Number)
  prioridad?: number;
}
