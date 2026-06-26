import { PartialType } from '@nestjs/mapped-types';
import { CreateEmpresaEcfConfigDto } from './create-empresa-ecf-config.dto';
import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateEmpresaEcfConfigDto extends PartialType(CreateEmpresaEcfConfigDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean;

  // Sobreescribir para omitir @Length cuando viene vacío (usuario no quiere cambiar la clave)
  @ValidateIf((o: any) => !!o.msellerPassword)
  @IsString() @Length(4, 200)
  msellerPassword?: string;

  @ValidateIf((o: any) => !!o.msellerApiKey)
  @IsString() @Length(8, 500)
  msellerApiKey?: string;
}
