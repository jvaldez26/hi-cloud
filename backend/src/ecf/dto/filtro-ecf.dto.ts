import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EstadoDGII } from '../entities/ecf.entity';

export class FiltroECFDto extends PaginationDto {
  @IsOptional()
  @IsEnum(EstadoDGII)
  estado?: EstadoDGII;

  @IsOptional()
  @IsString()
  @Matches(/^E\d{2}$/, { message: 'Tipo debe tener formato E31, E32, etc.' })
  tipo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Fecha debe tener formato YYYY-MM' })
  fecha?: string;
}
