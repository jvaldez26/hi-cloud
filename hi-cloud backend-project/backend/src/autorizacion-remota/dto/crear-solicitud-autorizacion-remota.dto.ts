import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CrearSolicitudAutorizacionRemotaDto {
  @IsString()
  clave!: string;

  @IsString()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  motivo!: string;

  @IsOptional()
  @IsInt()
  cajaId?: number;

  @IsOptional()
  @IsObject()
  detalle?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @IsPositive()
  facturaId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  @IsOptional()
  @IsNumber()
  monto?: number;
}

export class DecidirSolicitudAutorizacionRemotaDto {
  @IsIn(['aprobada', 'rechazada'])
  decision!: 'aprobada' | 'rechazada';

  @IsOptional()
  @IsString()
  comentario?: string;
}
