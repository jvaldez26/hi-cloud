import { IsEmail, IsString, MinLength, MaxLength, Matches, IsDefined, IsOptional } from 'class-validator';
import { IsValidRNC } from '../../common/validators/rnc.validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsDefined({ message: 'El nombre es requerido' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2,   { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre: string;

  @IsDefined({ message: 'El correo es requerido' })
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsDefined({ message: 'La contraseña es requerida' })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(8,   { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100, { message: 'La contraseña no puede superar 100 caracteres' })
  // S-48: requiere símbolo además de mayúscula, minúscula y número
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-#^()])/, {
    message: 'La contraseña debe tener al menos una mayúscula, minúscula, número y símbolo (@$!%*?&._-#)',
  })
  password: string;

  // ── Empresa (opcional — se crea atómicamente si se proveen) ──────────────

  @IsOptional()
  @IsString()
  @MaxLength(200)
  empresaNombre?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$|^\d{11}$/, { message: 'El RNC debe tener 9 dígitos (empresa) u 11 (cédula)' })
  @IsValidRNC({ message: 'El RNC/Cédula no tiene un dígito verificador válido (DGII)' })  // S-53
  empresaRnc?: string;
}
