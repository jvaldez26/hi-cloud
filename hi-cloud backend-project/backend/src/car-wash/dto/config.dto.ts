import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { CobroEnCw } from '../entities/tipos';

export class ActualizarConfigDto {
  @IsOptional() @IsInt() @Min(1)
  bahiasActivas?: number;

  @IsOptional() @IsString()
  prefijoTurno?: string;

  @IsOptional() @IsBoolean()
  usaSecado?: boolean;

  @IsOptional() @IsIn(['recepcion', 'entrega'])
  cobroEn?: CobroEnCw;

  @IsOptional() @IsInt() @Min(1)
  horasCaducidadEnlace?: number;
}
