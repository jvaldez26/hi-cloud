import { IsEnum, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { AsuntoSoporte } from '../entities/soporte-ticket.entity';

/**
 * Nombre y correo del usuario NO van aquí — se toman de la sesión
 * (@GetUser()) en el controller, nunca de un input editable. Evita que
 * alguien reporte un ticket a nombre de otro.
 *
 * Los campos de contexto van APLANADOS (url/modulo/navegador/buildId en vez
 * de un objeto `contexto` anidado) porque este DTO ahora llega también por
 * multipart/form-data (adjuntos) — un campo de formulario no puede ser un
 * objeto anidado sin JSON.stringify de por medio, y aplanarlo funciona
 * igual en JSON puro y en multipart, sin transformación especial.
 * empresaId/sucursalId/rol se completan server-side en el service,
 * ignorando cualquier valor que llegara aquí para esos campos.
 */
export class CreateSoporteTicketDto {
  @IsEnum(AsuntoSoporte)
  asunto!: AsuntoSoporte;

  @IsString()
  @MinLength(10, { message: 'Cuéntanos un poco más — mínimo 10 caracteres' })
  @MaxLength(2000)
  mensaje!: string;

  @IsOptional() @IsString() @MaxLength(500)
  url?: string;

  @IsOptional() @IsString() @MaxLength(100)
  modulo?: string;

  @IsOptional() @IsString() @MaxLength(300)
  navegador?: string;

  @IsOptional() @IsString() @MaxLength(100)
  buildId?: string;
}
