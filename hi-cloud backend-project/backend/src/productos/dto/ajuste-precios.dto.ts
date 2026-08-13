import {
  IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString,
  MaxLength, ArrayMaxSize, IsNumber, Min, Max,
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
 * Jerarquía de alcance (del más específico al más amplio):
 *   1. productoIds  — selección manual, ignora los demás
 *   2. categoria / marca / busqueda / soloConExistencia / vendidosUltimosMeses
 *      — filtros de DB, combinables entre sí
 *   3. soloNoRedondos — post-filtro: de los cargados, solo los que tienen centavos
 *   4. precioMin / precioMax — post-filtro por rango de precio al público actual
 *
 * Con todoElCatalogo=true, el endpoint procesa todo el catálogo aunque no haya
 * ningún otro filtro; sin él y sin ningún filtro, devuelve un aviso sugiriendo
 * soloNoRedondos.
 */
export class PreviewAjustePreciosDto {
  // ── Alcance ─────────────────────────────────────────────────────────────────

  /** Selección manual de productos (tiene prioridad sobre el resto de filtros). */
  @IsOptional() @IsArray() @ArrayMaxSize(5000)
  @IsInt({ each: true }) @Type(() => Number)
  productoIds?: number[];

  @IsOptional() @IsString() @MaxLength(100)
  categoria?: string;

  @IsOptional() @IsString() @MaxLength(100)
  marca?: string;

  /** Búsqueda parcial por nombre o código (ILIKE). */
  @IsOptional() @IsString() @MaxLength(150)
  busqueda?: string;

  /**
   * true → solo productos cuyo precio al público actual tiene centavos
   * (el conjunto que la herramienta existe para arreglar).
   * Es el filtro por defecto al abrir el modal.
   */
  @IsOptional() @IsBoolean()
  soloNoRedondos?: boolean;

  /** true → solo productos con stock > 0. */
  @IsOptional() @IsBoolean()
  soloConExistencia?: boolean;

  /**
   * N → solo productos vendidos al menos una vez en los últimos N meses.
   * Requiere un EXISTS en factura_detalles; útil para ajustar primero lo
   * que realmente aparece en tickets.
   */
  @IsOptional() @IsInt() @Min(1) @Max(36)
  @Type(() => Number)
  vendidosUltimosMeses?: number;

  /**
   * Rango de precio al público actual (post-filtro, después de calcular).
   * Útil para "solo los que cuestan más de RD$1,000".
   */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  precioMin?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  precioMax?: number;

  /**
   * true → procesa todo el catálogo aunque no haya ningún otro filtro.
   * Nunca es el default — el usuario debe marcarlo explícitamente.
   */
  @IsOptional() @IsBoolean()
  todoElCatalogo?: boolean;

  // ── Política de redondeo ─────────────────────────────────────────────────────

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
