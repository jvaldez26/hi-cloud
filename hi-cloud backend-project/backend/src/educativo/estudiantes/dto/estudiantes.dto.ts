import {
  IsDefined, IsOptional, IsString, IsBoolean, IsInt, IsIn, IsEmail, IsDateString, MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateEstudianteDto {
  @IsDefined({ message: 'Los nombres son requeridos' })
  @IsString({ message: 'Los nombres deben ser texto' })
  @MaxLength(200, { message: 'Los nombres no pueden superar 200 caracteres' })
  @Transform(trim)
  nombres: string;

  @IsDefined({ message: 'Los apellidos son requeridos' })
  @IsString({ message: 'Los apellidos deben ser texto' })
  @MaxLength(200, { message: 'Los apellidos no pueden superar 200 caracteres' })
  @Transform(trim)
  apellidos: string;

  @IsOptional()
  @IsIn(['M', 'F'], { message: 'El sexo debe ser M o F' })
  sexo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsString({ message: 'La cédula debe ser texto' })
  @MaxLength(20, { message: 'La cédula no puede superar 20 caracteres' })
  @Transform(trim)
  cedula?: string;

  @IsOptional()
  @IsString({ message: 'La foto debe ser una URL de texto' })
  foto?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  direccion?: string;

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
  @IsString({ message: 'El tipo de sangre debe ser texto' })
  @MaxLength(10, { message: 'El tipo de sangre no puede superar 10 caracteres' })
  @Transform(trim)
  tipoSangre?: string;

  @IsOptional()
  @IsString({ message: 'Las alergias deben ser texto' })
  alergias?: string;

  @IsOptional()
  @IsString({ message: 'Las condiciones médicas deben ser texto' })
  condicionesMedicas?: string;

  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser texto' })
  observaciones?: string;
}

export class UpdateEstudianteDto {
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
  @IsIn(['M', 'F'], { message: 'El sexo debe ser M o F' })
  sexo?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)' })
  fechaNacimiento?: string;

  @IsOptional()
  @IsString({ message: 'La cédula debe ser texto' })
  @MaxLength(20, { message: 'La cédula no puede superar 20 caracteres' })
  @Transform(trim)
  cedula?: string;

  @IsOptional()
  @IsString({ message: 'La foto debe ser una URL de texto' })
  foto?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  direccion?: string;

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
  @IsString({ message: 'El tipo de sangre debe ser texto' })
  @MaxLength(10, { message: 'El tipo de sangre no puede superar 10 caracteres' })
  @Transform(trim)
  tipoSangre?: string;

  @IsOptional()
  @IsString({ message: 'Las alergias deben ser texto' })
  alergias?: string;

  @IsOptional()
  @IsString({ message: 'Las condiciones médicas deben ser texto' })
  condicionesMedicas?: string;

  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser texto' })
  observaciones?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser verdadero o falso' })
  isActive?: boolean;
}

export class AddTutorDto {
  @IsDefined({ message: 'El tutor es requerido' })
  @IsInt({ message: 'El tutor debe ser un identificador numérico' })
  tutorId: number;

  @IsOptional()
  @IsBoolean({ message: 'esPrincipal debe ser verdadero o falso' })
  esPrincipal?: boolean;
}
