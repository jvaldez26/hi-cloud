import { IsString, IsNotEmpty, MaxLength, IsBoolean, IsOptional } from 'class-validator';

export class LoginDto {
  /**
   * Correo o nombre de usuario — un solo campo. AuthService.login() decide
   * cuál de los dos es mirando si contiene '@'.
   *
   * Antes se llamaba `email` y validaba con @IsEmail — cuando el username
   * entró a compartir este campo, esa validación empezó a rechazar
   * cualquier login por username, y el nombre `email` pasó a ser mentira
   * (un campo que puede contener "caja01" pero se llama email invita a que
   * alguien, confiando en el nombre, le aplique validación de correo más
   * adelante). Se renombró de verdad — DTO, body que manda el frontend,
   * claves de LoginAttemptsService, estado del LoginPage — en vez de
   * dejarlo así "por compatibilidad".
   */
  @IsString({ message: 'Ingresa tu correo o nombre de usuario' })
  @IsNotEmpty({ message: 'El correo o nombre de usuario es requerido' })
  @MaxLength(150, { message: 'Máximo 150 caracteres' })
  identificador: string;

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
