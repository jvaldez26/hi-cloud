import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { EstadoCuenta } from '../enums/estado-cuenta.enum';

export class FiltroCuentasDto extends PaginationDto {
  @IsOptional()
  @IsEnum(EstadoCuenta)
  estado?: EstadoCuenta;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;
  // `search` heredado de PaginationDto
}
