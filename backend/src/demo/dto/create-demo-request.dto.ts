import {
  IsString, IsEmail, IsNotEmpty, IsEnum,
  IsOptional, IsArray, MaxLength,
} from 'class-validator';
import { TamanoEmpresa, EstadoDemo } from '../entities/demo-request.entity';

export class CreateDemoRequestDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  nombre: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  empresa: string;

  @IsEmail()
  email: string;

  @IsString() @IsNotEmpty() @MaxLength(25)
  telefono: string;

  @IsOptional() @IsString() @MaxLength(50)
  pais?: string;

  @IsEnum(TamanoEmpresa)
  tamanoEmpresa: TamanoEmpresa;

  @IsOptional() @IsArray()
  modulosInteres?: string[];

  @IsOptional() @IsString() @MaxLength(500)
  mensaje?: string;
}

export class UpdateDemoRequestDto {
  @IsOptional() @IsEnum(EstadoDemo)
  estado?: string;

  @IsOptional() @IsString()
  notasInternas?: string;

  @IsOptional() @IsString()
  asignadoA?: string;
}
