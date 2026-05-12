import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  MaxLength,
  IsEnum,
  Matches,
} from 'class-validator';
import { AmbienteECF } from '../entities/proveedor-ecf.entity';

export class CreateProveedorECFDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsUrl()
  @MaxLength(300)
  apiUrl: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  apiKey: string;

  @IsEnum(AmbienteECF)
  ambiente: AmbienteECF;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$|^\d{11}$/, { message: 'RNC inválido' })
  rnc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial: string;

  @IsOptional()
  @IsString()
  certificadoDigital?: string;

  @IsOptional()
  configuracion?: Record<string, unknown>;
}
