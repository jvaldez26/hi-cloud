import {
  IsInt, IsPositive, IsIn, IsOptional,
  IsBoolean, IsString, IsNotEmpty, IsEmail,
  MaxLength, Matches,
} from 'class-validator';
import { UserRole, ROLES_ASIGNABLES_EMPRESA } from '../../users/enums/user-role.enum';

export class AsignarUsuarioEmpresaDto {
  @IsInt({ message: 'ID de usuario inválido' })
  @IsPositive({ message: 'ID de usuario inválido' })
  userId: number;

  // S-60: lista blanca — 'super_admin' NO es asignable desde @Roles(ADMIN).
  @IsIn(ROLES_ASIGNABLES_EMPRESA as UserRole[], {
    message: `Rol inválido. Permitidos: ${ROLES_ASIGNABLES_EMPRESA.join(', ')}`,
  })
  rol: UserRole;

  @IsOptional()
  @IsBoolean({ message: 'El campo principal debe ser verdadero o falso' })
  isPrincipal?: boolean;
}

export class CambiarEmpresaDto {
  @IsInt({ message: 'ID de empresa inválido' })
  @IsPositive({ message: 'ID de empresa inválido' })
  empresaId: number;
}

export class CreateEmpresaTenantDto {
  @IsString({ message: 'El RNC debe ser texto' })
  @Matches(/^\d{9}$|^\d{11}$/, { message: 'RNC inválido — debe tener 9 dígitos (empresa) u 11 dígitos (persona física)' })
  rnc: string;

  @IsString({ message: 'El nombre de la empresa debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de la empresa es requerido' })
  @MaxLength(200, { message: 'El nombre de la empresa no puede superar 200 caracteres' })
  nombre: string;

  @IsOptional()
  @IsString({ message: 'El nombre comercial debe ser texto' })
  @MaxLength(200, { message: 'El nombre comercial no puede superar 200 caracteres' })
  nombreComercial?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  @MaxLength(300, { message: 'La dirección no puede superar 300 caracteres' })
  direccion?: string;

  @IsOptional()
  @IsString({ message: 'La ciudad debe ser texto' })
  @MaxLength(100, { message: 'La ciudad no puede superar 100 caracteres' })
  ciudad?: string;

  @IsOptional()
  @IsString({ message: 'El sector debe ser texto' })
  @MaxLength(100, { message: 'El sector no puede superar 100 caracteres' })
  sector?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @MaxLength(20, { message: 'El teléfono no puede superar 20 caracteres' })
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  email?: string;
}
