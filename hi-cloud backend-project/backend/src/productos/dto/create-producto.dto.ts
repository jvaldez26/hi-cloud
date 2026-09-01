import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateProductoDto {
  @IsOptional()
  @IsString()
  @IsIn(['producto', 'servicio'])
  tipo?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;  // null = "borrar y auto-generar"
    if (!value || value === 'undefined' || value === 'null' || !String(value).trim()) return undefined;
    return String(value).trim();
  })
  @IsString()
  @MaxLength(30)
  codigo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigoBarras?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString() @MaxLength(2000)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unidadMedida?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(9_999_999_999)
  @Type(() => Number)
  precio: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  precio2?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  precio3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999)
  @Type(() => Number)
  costo?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @Type(() => Number)
  porcentajeIva?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99_999_999)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99_999_999)
  @Type(() => Number)
  stockMinimo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  claveProductoSat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  claveUnidadSat?: string;

  @IsOptional()
  @IsString()
  imagenUrl?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  almacenId?: number;   // Almacén donde inicializar el stock al crear/actualizar

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  ubicacionId?: number; // Ubicación WMS por defecto dentro del almacén (opcional)

  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referencia?: string;

  @IsOptional()
  @IsBoolean()
  esCreacionRapida?: boolean;

  /**
   * Proveedor que vende este producto. OPCIONAL, y debe seguir siéndolo.
   *
   * Un producto sin proveedor conocido es un caso legítimo, y bloquear el alta
   * por eso entorpece el mostrador. Si viene, se crea el par en
   * `producto_proveedor`; si no, no pasa nada y el producto se vinculará solo
   * cuando entre en una compra.
   *
   * No es una columna de `productos`: el service lo saca del payload antes de
   * construir la entidad.
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  proveedorId?: number;

  // ── Balanzas etiquetadoras ────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999)
  @Type(() => Number)
  plu?: number | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  esPesable?: boolean;
}
