import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';

export class FiltroContabilidadDto extends PaginationDto {
  @IsOptional() @IsDateString()
  fechaDesde?: string;

  @IsOptional() @IsDateString()
  fechaHasta?: string;

  @IsOptional() @IsEnum(TipoOrigenAsiento)
  tipoOrigen?: TipoOrigenAsiento;

  @IsOptional() @IsEnum(EstadoAsiento)
  estado?: EstadoAsiento;
}
