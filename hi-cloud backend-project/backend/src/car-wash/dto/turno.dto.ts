import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ESTADOS_TURNO_CW, TIPOS_VEHICULO_CW } from '../entities/tipos';
import type { EstadoTurnoCw, TipoVehiculoCw } from '../entities/tipos';

export class CrearTurnoDto {
  @IsOptional() @IsInt()
  sucursalId?: number;

  @IsString() @MaxLength(20)
  placa!: string;

  @IsIn(TIPOS_VEHICULO_CW)
  tipoVehiculo!: TipoVehiculoCw;

  @IsOptional() @IsString() @MaxLength(100)
  marca?: string;

  @IsOptional() @IsString() @MaxLength(50)
  color?: string;

  @IsOptional() @IsInt()
  clienteId?: number;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsArray() @ArrayMinSize(1)
  servicioIds!: number[];

  @IsOptional() @IsString()
  notasDanos?: string;
}

export class CambiarEstadoTurnoDto {
  @IsIn(ESTADOS_TURNO_CW)
  estado!: EstadoTurnoCw;

  @IsOptional() @IsString()
  motivo?: string;

  /** ADMIN/SUPERVISOR puede forzar ENTREGADO sin cobro — queda registrado en el evento. */
  @IsOptional()
  forzarSinCobro?: boolean;
}

export class EditarTurnoDto {
  @IsOptional() @IsString() @MaxLength(100)
  marca?: string;

  @IsOptional() @IsString() @MaxLength(50)
  color?: string;

  @IsOptional() @IsString() @MaxLength(20)
  telefono?: string;

  @IsOptional() @IsString()
  notasDanos?: string;
}

export class AsignarBahiaDto {
  @IsOptional() @IsInt()
  bahia?: number;

  @IsOptional() @IsString() @MaxLength(150)
  lavadorNombre?: string;
}
