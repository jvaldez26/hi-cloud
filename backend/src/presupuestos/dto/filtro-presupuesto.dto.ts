import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TipoPresupuesto, EstadoPresupuesto } from '../entities/presupuesto.entity';

export class FiltroPresupuestoDto extends PaginationDto {
  @IsOptional() @IsInt() @Min(2020) @Type(() => Number)
  anio?: number;

  @IsOptional() @IsEnum(TipoPresupuesto)
  tipo?: TipoPresupuesto;

  @IsOptional() @IsEnum(EstadoPresupuesto)
  estado?: EstadoPresupuesto;
}
