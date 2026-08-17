import { IsString, IsNotEmpty, IsIn, IsOptional, IsInt, IsBoolean, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateVideoTutorialDto {
  @ApiProperty({ example: 'clientes', description: 'Clave del módulo (path de la ruta React)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  modulo: string;

  @ApiProperty({ example: 'Módulo de Clientes — Guía completa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  titulo: string;

  @ApiPropertyOptional({ example: 'Aprende a registrar, editar y gestionar clientes y sus e-CF.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @ApiProperty({ enum: ['youtube', 'vimeo'], example: 'youtube' })
  @IsIn(['youtube', 'vimeo'])
  proveedor: 'youtube' | 'vimeo';

  @ApiProperty({ example: 'dQw4w9WgXcQ', description: 'ID del video en la plataforma (no la URL completa)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  videoId: string;

  @ApiPropertyOptional({ example: 480, description: 'Duración en segundos' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  duracionSegundos?: number;

  @ApiPropertyOptional({ example: 0, description: 'Orden de presentación' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  orden?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
