import { IsEnum, IsOptional, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EstadoActivo } from '../entities/activo-fijo.entity';

export class FiltroActivosDto extends PaginationDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  categoriaId?: number;

  @IsOptional() @IsEnum(EstadoActivo)
  estado?: EstadoActivo;
}

export class FiltroDepreciacionDto extends PaginationDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  activoId?: number;

  @IsOptional()
  periodo?: string;
}
