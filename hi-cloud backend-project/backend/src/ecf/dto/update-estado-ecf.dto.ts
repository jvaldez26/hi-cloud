import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoDGII } from '../entities/ecf.entity';

export class UpdateEstadoECFDto {
  @IsEnum(EstadoDGII)
  estadoDGII: EstadoDGII;

  @IsOptional()
  @IsString()
  xmlRespuesta?: string;

  @IsOptional()
  @IsString()
  firmaDigital?: string;

  @IsOptional()
  @IsString()
  proveedorReferencia?: string;
}
