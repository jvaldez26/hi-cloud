import {
  IsString, IsNotEmpty, IsOptional, IsEmail,
  MaxLength, Matches, IsBoolean,
} from 'class-validator';

export class CreateProveedorDto {
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del proveedor es requerido' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  nombre: string;

  @IsOptional()
  @IsString({ message: 'El RNC debe ser texto' })
  @Matches(/^\d{9}$|^\d{11}$/, {
    message: 'RNC inválido — debe tener 9 dígitos (empresa) u 11 dígitos (persona física)',
  })
  rnc?: string;

  @IsOptional()
  @IsBoolean()
  esInformal?: boolean;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  @MaxLength(300, { message: 'La dirección no puede superar 300 caracteres' })
  direccion?: string;

  @IsOptional()
  @IsString({ message: 'El nombre del contacto debe ser texto' })
  @MaxLength(100, { message: 'El contacto no puede superar 100 caracteres' })
  contacto?: string;

  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto' })
  notas?: string;
}
