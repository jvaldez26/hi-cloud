import {
  IsString, IsNotEmpty, IsOptional,
  IsBoolean, IsEmail, MaxLength,
} from 'class-validator';

export class CreateSucursalDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  codigo: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(300)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(100)
  ciudad?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsBoolean()
  esPrincipal?: boolean;

  @IsOptional() @IsString()
  notas?: string;
}
