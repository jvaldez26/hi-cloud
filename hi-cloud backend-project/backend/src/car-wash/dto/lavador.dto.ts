import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { MODOS_PAGO_LAVADOR_CW } from '../entities/tipos';
import type { ModoPagoLavadorCw } from '../entities/tipos';

export class CrearLavadorDto {
  @IsString()
  nombre!: string;

  @IsOptional() @IsString()
  cedula?: string;

  @IsOptional() @IsString()
  telefono?: string;

  @IsIn(MODOS_PAGO_LAVADOR_CW)
  modoPago!: ModoPagoLavadorCw;

  @IsNumber() @Min(0)
  valorModoPago!: number;
}

export class ActualizarLavadorDto {
  @IsOptional() @IsString()
  nombre?: string;

  @IsOptional() @IsString()
  cedula?: string;

  @IsOptional() @IsString()
  telefono?: string;

  @IsOptional() @IsBoolean()
  activo?: boolean;

  @IsOptional() @IsIn(MODOS_PAGO_LAVADOR_CW)
  modoPago?: ModoPagoLavadorCw;

  @IsOptional() @IsNumber() @Min(0)
  valorModoPago?: number;
}
