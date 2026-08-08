import {
  IsString, IsNotEmpty, IsIn, IsInt, IsBoolean, IsOptional,
  Min, Max, MaxLength, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePatronDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string;

  @IsString()
  @IsIn(['2', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29'])
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
  unidadPeso?: string | null;

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
