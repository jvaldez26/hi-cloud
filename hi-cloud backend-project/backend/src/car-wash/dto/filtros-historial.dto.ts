import { IsBooleanString, IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ESTADOS_TURNO_CW, TIPOS_VEHICULO_CW } from '../entities/tipos';
import type { EstadoTurnoCw, TipoVehiculoCw } from '../entities/tipos';

export class FiltrosHistorialTurnoDto {
  @IsOptional() @IsDateString()
  desde?: string;

  @IsOptional() @IsDateString()
  hasta?: string;

  @IsOptional() @IsIn(ESTADOS_TURNO_CW)
  estado?: EstadoTurnoCw;

  @IsOptional() @IsString()
  placa?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  lavadorId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  servicioId?: number;

  @IsOptional() @IsIn(TIPOS_VEHICULO_CW)
  tipoVehiculo?: TipoVehiculoCw;

  @IsOptional() @IsBooleanString()
  cobrado?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  limit?: number;
}
