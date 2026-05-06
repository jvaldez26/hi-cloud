import { PartialType } from '@nestjs/mapped-types';
import { CreateEmpresaEcfConfigDto } from './create-empresa-ecf-config.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEmpresaEcfConfigDto extends PartialType(CreateEmpresaEcfConfigDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean;
}
