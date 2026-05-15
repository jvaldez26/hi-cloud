import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2,   { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(8,   { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100, { message: 'La contraseña no puede superar 100 caracteres' })
  password?: string;
  // role eliminado intencionalmente — cambio de rol solo vía SuperAdmin (/admin/usuarios/:id/rol)
}
