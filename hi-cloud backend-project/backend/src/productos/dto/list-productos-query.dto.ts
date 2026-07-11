import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListProductosQueryDto extends PaginationDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  incluirSinStock?: boolean;

  @IsOptional()
  @IsString()
  tipo?: string;  // 'producto' | 'servicio'
}
