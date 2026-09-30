import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class VincularXlinkDto {
  @IsUUID()
  xlinkId!: string;

  @IsNotEmpty()
  @IsIn(['proveedor', 'cliente'])
  rol!: 'proveedor' | 'cliente';
}
