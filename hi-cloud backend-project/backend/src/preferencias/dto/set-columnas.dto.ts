import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SetColumnasDto {
  @ApiProperty({ example: ['bon', 'inv'], description: 'Claves de columnas visibles por defecto que el usuario ocultó.' })
  @IsArray()
  @IsString({ each: true })
  ocultas!: string[];

  @ApiProperty({ example: ['destinoItbis'], description: 'Claves de columnas ocultas por defecto que el usuario mostró.' })
  @IsArray()
  @IsString({ each: true })
  mostradas!: string[];
}
