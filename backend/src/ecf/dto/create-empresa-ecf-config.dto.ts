import {
  IsEnum, IsInt, IsOptional, IsPositive, IsString,
  IsUrl, Length, Matches,
} from 'class-validator';
import { ModoEcf } from '../entities/empresa-ecf-config.entity';

export class CreateEmpresaEcfConfigDto {
  @IsInt() @IsPositive()
  empresaId!: number;

  @IsString() @Length(3, 150)
  msellerEmail!: string;

  /** Contraseña en texto plano — se cifra antes de persistir */
  @IsString() @Length(4, 200)
  msellerPassword!: string;

  /** API Key de MSeller — se cifra antes de persistir */
  @IsString() @Length(8, 500)
  msellerApiKey!: string;

  @IsUrl({}, { message: 'msellerUrlBase debe ser una URL válida' })
  @IsOptional()
  msellerUrlBase?: string;

  @IsEnum(ModoEcf)
  @IsOptional()
  modo?: ModoEcf;

  @IsString() @Matches(/^\d{9}$|^\d{11}$/, { message: 'RNC debe tener 9 u 11 dígitos' })
  rncEmisor!: string;

  @IsString() @Length(2, 300)
  razonSocialEmisor!: string;

  @IsString() @Length(1, 200) @IsOptional()
  nombreComercial?: string;

  @IsString() @Length(1, 400) @IsOptional()
  direccionEmisor?: string;

  @IsString() @Length(1, 100) @IsOptional()
  municipio?: string;

  @IsString() @Length(1, 100) @IsOptional()
  provincia?: string;
}
