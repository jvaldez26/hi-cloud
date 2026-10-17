import { IsString, IsNotEmpty, IsOptional, IsInt, IsPositive, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCategoriaProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  /** Un solo nivel — debe ser una categoría SIN padre propio (ver validarPadre). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoriaPadreId?: number | null;
}

export class UpdateCategoriaProductoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoriaPadreId?: number | null;
}

export class FusionarCategoriaDto {
  /** La categoría de origen (:id de la ruta) se fusiona EN esta. */
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoriaDestinoId: number;
}
