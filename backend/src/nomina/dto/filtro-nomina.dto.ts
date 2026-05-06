import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EstadoEmpleado } from '../entities/empleado.entity';
import { EstadoNomina } from '../entities/nomina-periodo.entity';

export class FiltroEmpleadoDto extends PaginationDto {
  @IsOptional() @IsEnum(EstadoEmpleado)
  estado?: EstadoEmpleado;

  @IsOptional() @IsString()
  departamento?: string;
}

export class FiltroNominaPeriodoDto extends PaginationDto {
  @IsOptional() @IsEnum(EstadoNomina)
  estado?: EstadoNomina;

  @IsOptional() @IsString()
  periodo?: string;
}
