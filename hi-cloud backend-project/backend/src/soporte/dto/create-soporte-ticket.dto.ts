import { IsEnum, IsString, MinLength, MaxLength, IsOptional, IsObject } from 'class-validator';
import { AsuntoSoporte } from '../entities/soporte-ticket.entity';

/**
 * Nombre y correo del usuario NO van aquí — se toman de la sesión
 * (@GetUser()) en el controller, nunca de un input editable. Evita que
 * alguien reporte un ticket a nombre de otro.
 */
export class CreateSoporteTicketDto {
  @IsEnum(AsuntoSoporte)
  asunto!: AsuntoSoporte;

  @IsString()
  @MinLength(10, { message: 'Cuéntanos un poco más — mínimo 10 caracteres' })
  @MaxLength(2000)
  mensaje!: string;

  /**
   * Solo lo que el CLIENTE conoce y el servidor no puede derivar: URL
   * actual, módulo visible, navegador/versión, build_id del bundle que
   * está corriendo. empresaId/sucursalId/rol se completan server-side en
   * el service, ignorando cualquier valor que llegara aquí para esos campos.
   */
  @IsOptional()
  @IsObject()
  contexto?: {
    url?:      string;
    modulo?:   string;
    navegador?: string;
    buildId?:  string;
  };
}
