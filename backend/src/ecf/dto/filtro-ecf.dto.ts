import { IsEnum, IsOptional, IsString, IsInt, IsPositive, Matches } from 'class-validator';
import { Type } from 'class-transformer';
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

  /** Filtrar por ID de factura — usado por FacturaDetailPage para obtener el e-CF de una factura específica */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  facturaId?: number;

  /** Filtrar por ID de documento origen genérico (POS, Compra, Gasto) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  documentoOrigenId?: number;
}
