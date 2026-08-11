import {
  IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ModoRedondeo, DireccionRedondeo } from '../ajuste-precios.util';

export const MODOS_REDONDEO = [
  'entero', 'multiplo5', 'multiplo10', 'terminacion95', 'terminacion99',
] as const;

export const DIRECCIONES = ['cercano', 'arriba', 'abajo'] as const;

/**
 * Preview del ajuste de precios al público. SOLO LECTURA: calcula y devuelve la
 * propuesta, no escribe nada.
 *
 * El conjunto NUNCA es "todos" por defecto: hay que acotar por categoría, marca
 * o una selección explícita de ids. Sin ningún filtro, el endpoint responde
 * vacío pidiendo que se acote.
 */
export class PreviewAjustePreciosDto {
  @IsOptional() @IsString() @MaxLength(100)
  categoria?: string;

  @IsOptional() @IsString() @MaxLength(100)
  marca?: string;

  /** Selección manual de productos (tiene prioridad sobre categoría/marca) */
  @IsOptional() @IsArray() @ArrayMaxSize(5000)
  @IsInt({ each: true }) @Type(() => Number)
  productoIds?: number[];

  @IsEnum(MODOS_REDONDEO)
  modo: ModoRedondeo;

  @IsOptional() @IsEnum(DIRECCIONES)
  direccion?: DireccionRedondeo;

  /**
   * true (por defecto): solo devuelve los productos cuyo precio al público
   * cambiaría. Poner false para ver también los que ya están redondos.
   */
  @IsOptional() @IsBoolean()
  soloConCambio?: boolean;
}
