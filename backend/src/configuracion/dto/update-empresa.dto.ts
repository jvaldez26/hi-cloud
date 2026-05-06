import {
  IsString, IsOptional, IsEmail, IsUrl, IsObject,
  MaxLength, Matches, IsDateString, IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SectorEmpresa, TipoSociedad, RegimenFiscal } from '../entities/empresa.entity';

export class UpdateEmpresaDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$|^\d{11}$/, { message: 'RNC inválido (9 u 11 dígitos)' })
  rnc?: string;

  @IsOptional() @IsString() @MaxLength(300)
  nombre?: string;

  @IsOptional() @IsString() @MaxLength(300)
  razonSocial?: string;

  @IsOptional() @IsString() @MaxLength(200)
  nombreComercial?: string;

  @IsOptional() @IsEnum(TipoSociedad)
  tipoSociedad?: TipoSociedad;

  @IsOptional() @IsEnum(SectorEmpresa)
  sector?: SectorEmpresa;

  @IsOptional() @IsEnum(RegimenFiscal)
  regimen?: RegimenFiscal;

  @IsOptional() @IsString() @MaxLength(400)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(100)
  ciudad?: string;

  @IsOptional() @IsString() @MaxLength(100)
  provincia?: string;

  @IsOptional() @IsString() @MaxLength(10)
  codigoPostal?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsUrl({ require_tld: false })
  @MaxLength(300)
  sitioWeb?: string;

  @IsOptional() @IsString() @MaxLength(300)
  logo?: string;

  @IsOptional() @IsString() @MaxLength(200)
  representanteLegal?: string;

  @IsOptional() @IsString() @MaxLength(13)
  cedulaRepresentante?: string;

  @IsOptional() @IsDateString()
  fechaConstitucion?: string;

  @IsOptional() @IsString() @MaxLength(200)
  actividadEconomica?: string;

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  configuracion?: Record<string, unknown>;
}
