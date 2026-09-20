import { IsString, IsNotEmpty, IsOptional, IsDateString, MaxLength } from 'class-validator';

/**
 * Crea una NUEVA versión de un parámetro. Nunca actualiza una fila existente:
 * el service cierra la vigencia de la fila abierta (si la hay) y crea esta
 * como la nueva fila vigente. `valor` puede venir vacío/null — un parámetro
 * PENDIENTE_VALIDACION existe como registro (clave, base legal, fuente) sin
 * que todavía se conozca el número real.
 */
export class CrearParametroFiscalDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  clave!: string;

  @IsOptional()
  valor?: unknown;

  @IsDateString()
  vigenciaDesde!: string;

  @IsString() @IsNotEmpty()
  baseLegal!: string;

  @IsString() @IsNotEmpty()
  fuente!: string;
}
