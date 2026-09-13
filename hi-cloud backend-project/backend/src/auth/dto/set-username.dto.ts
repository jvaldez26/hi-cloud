import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_REGEX } from '../auth.constants';

export class SetUsernameDto {
  @ApiProperty({
    example: 'caja01',
    description: `${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} caracteres. Solo letras, números, punto, guion y guion bajo — sin espacios.`,
  })
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  // Normaliza a minúsculas antes de validar formato y de guardar — la
  // unicidad real vive en el índice sobre LOWER(username) de la migración,
  // pero guardar ya en minúsculas evita que un lookup por igualdad directa
  // (sin LOWER) se comporte distinto según quién lo escribió.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @MinLength(USERNAME_MIN_LENGTH, { message: `El nombre de usuario debe tener al menos ${USERNAME_MIN_LENGTH} caracteres` })
  @MaxLength(USERNAME_MAX_LENGTH, { message: `El nombre de usuario no puede superar ${USERNAME_MAX_LENGTH} caracteres` })
  // Solo ASCII: rechaza por construcción espacios, acentos, homoglifos y
  // caracteres invisibles — ver el comentario de USERNAME_REGEX.
  @Matches(USERNAME_REGEX, {
    message: 'Solo letras, números, punto (.), guion (-) y guion bajo (_) — sin espacios ni acentos',
  })
  username!: string;
}
