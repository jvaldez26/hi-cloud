import { IsOptional, IsBoolean, IsString, IsPositive, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Límite máximo para /productos. El POS necesita el catálogo completo (≈5 000 items),
 *  pero no tiene sentido permitir peticiones arbitrarias mayores. */
const PRODUCTOS_MAX_LIMIT = 5_000;

export class ListProductosQueryDto extends PaginationDto {
  /** Sobreescribe PaginationDto.limit para añadir un tope máximo. */
  @IsOptional()
  @IsPositive()
  @Max(PRODUCTOS_MAX_LIMIT, { message: `limit no puede superar ${PRODUCTOS_MAX_LIMIT}` })
  @Type(() => Number)
  override limit?: number = 10;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  incluirSinStock?: boolean;

  @IsOptional()
  @IsString()
  tipo?: string;  // 'producto' | 'servicio'
}
