import { ArrayMinSize, IsArray, IsIn, IsInt, IsPositive } from 'class-validator';
import { XlinkTipoDocumento } from '../entities/xlink-documento.entity';

export class PublicarXlinkDto {
  @IsIn(Object.values(XlinkTipoDocumento))
  tipoDocumento!: XlinkTipoDocumento;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  documentoIds!: number[];
}

export interface PublicarXlinkResultadoItem {
  id: number;
  ok: boolean;
  error?: string;
}
