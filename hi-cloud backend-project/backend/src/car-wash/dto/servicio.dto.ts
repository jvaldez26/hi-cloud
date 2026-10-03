import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { TIPOS_VEHICULO_CW } from '../entities/tipos';
import type { TipoVehiculoCw } from '../entities/tipos';

export class PrecioPorTipoDto {
  @IsIn(TIPOS_VEHICULO_CW)
  tipoVehiculo!: TipoVehiculoCw;

  @IsInt() @Min(1)
  duracionMinutos!: number;

  @IsNumber() @Min(0)
  precio!: number;

  /** Prioridad sobre lavador.valorModoPago cuando modoPago='por_servicio'. */
  @IsOptional() @IsNumber() @Min(0)
  tarifaLavador?: number;
}

export class CrearServicioDto {
  @IsString()
  nombre!: string;

  @IsOptional() @IsInt()
  productoId?: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrecioPorTipoDto)
  precios!: PrecioPorTipoDto[];
}

export class ActualizarServicioDto {
  @IsOptional() @IsString()
  nombre?: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrecioPorTipoDto)
  precios?: PrecioPorTipoDto[];

  @IsOptional()
  activo?: boolean;
}
