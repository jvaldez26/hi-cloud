import { IsEnum, IsOptional, IsDateString, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TipoMovimientoBancario, OrigenMovimiento } from '../entities/movimiento-bancario.entity';
import { EstadoConciliacion } from '../entities/conciliacion-bancaria.entity';

export class FiltroMovimientoDto extends PaginationDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  cuentaBancariaId?: number;

  @IsOptional() @IsEnum(TipoMovimientoBancario)
  tipo?: TipoMovimientoBancario;

  @IsOptional() @IsEnum(OrigenMovimiento)
  origen?: OrigenMovimiento;

  @IsOptional() @IsDateString()
  fechaDesde?: string;

  @IsOptional() @IsDateString()
  fechaHasta?: string;
}

export class FiltroConciliacionDto extends PaginationDto {
  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  cuentaBancariaId?: number;

  @IsOptional() @IsEnum(EstadoConciliacion)
  estado?: EstadoConciliacion;
}
