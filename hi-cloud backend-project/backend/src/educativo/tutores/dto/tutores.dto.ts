import { IsDefined, IsOptional, IsString, IsBoolean, IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTutorDto {
  @IsDefined({ message: 'Los nombres son requeridos' })
  @IsString({ message: 'Los nombres deben ser texto' })
  @MaxLength(200, { message: 'Los nombres no pueden superar 200 caracteres' })
  @Transform(trim)
  nombres: string;

  @IsOptional()
  @IsString({ message: 'Los apellidos deben ser texto' })
  @MaxLength(200, { message: 'Los apellidos no pueden superar 200 caracteres' })
  @Transform(trim)
  apellidos?: string;

  @IsOptional()
  @IsString({ message: 'La cédula debe ser texto' })
  @MaxLength(20, { message: 'La cédula no puede superar 20 caracteres' })
  @Transform(trim)
  cedula?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  @Transform(trim)
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  direccion?: string;

  @IsOptional()
  @IsString({ message: 'El parentesco debe ser texto' })
  @MaxLength(50, { message: 'El parentesco no puede superar 50 caracteres' })
  @Transform(trim)
  parentesco?: string;
}

export class UpdateTutorDto {
  @IsOptional()
  @IsString({ message: 'Los nombres deben ser texto' })
  @MaxLength(200, { message: 'Los nombres no pueden superar 200 caracteres' })
  @Transform(trim)
  nombres?: string;

  @IsOptional()
  @IsString({ message: 'Los apellidos deben ser texto' })
  @MaxLength(200, { message: 'Los apellidos no pueden superar 200 caracteres' })
  @Transform(trim)
  apellidos?: string;

  @IsOptional()
  @IsString({ message: 'La cédula debe ser texto' })
  @MaxLength(20, { message: 'La cédula no puede superar 20 caracteres' })
  @Transform(trim)
  cedula?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  @Transform(trim)
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  direccion?: string;

  @IsOptional()
  @IsString({ message: 'El parentesco debe ser texto' })
  @MaxLength(50, { message: 'El parentesco no puede superar 50 caracteres' })
  @Transform(trim)
  parentesco?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}
