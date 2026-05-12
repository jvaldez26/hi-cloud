import { PartialType } from '@nestjs/mapped-types';
import { CreateEmpleadoDto } from './create-empleado.dto';
import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { EstadoEmpleado } from '../entities/empleado.entity';

export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {
  @IsOptional()
  @IsEnum(EstadoEmpleado)
  estado?: EstadoEmpleado;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;
}
