import { IsEmail, IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email: string;

  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;

  /**
   * Segundo paso del flujo de sesión única.
   * Si el servidor detecta sesión activa y devuelve requiresSessionConfirmation:true,
   * el frontend muestra un modal; si el usuario confirma, reenvía con forceLogin:true.
   */
  @IsOptional()
  @IsBoolean()
  forceLogin?: boolean;
}
