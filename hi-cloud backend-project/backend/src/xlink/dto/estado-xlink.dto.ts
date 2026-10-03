import { ArrayMinSize, IsArray, IsEnum, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { XlinkTipoDocumento, XlinkEstadoReceptor } from '../entities/xlink-documento.entity';

export class EstadoXlinkDto {
  @IsEnum(XlinkTipoDocumento)
  tipoDocumento!: XlinkTipoDocumento;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  @Type(() => Number)
  documentoIds!: number[];
}

export interface EstadoXlinkItem {
  id: number;
  /** Ya se publicó antes — si es true, `estadoReceptor`/`numeroGenerado` describen ese envío; `elegible` siempre es false. */
  yaEnviado: boolean;
  estadoReceptor?: XlinkEstadoReceptor;
  numeroGenerado?: string;
  /** Puede enviarse AHORA — heurística de UX (igual que EnviarPorXlinkButton): el backend de /xlink/publicar es la barrera real. */
  elegible: boolean;
  /** Motivo concreto por el que NO es elegible — nunca genérico, siempre explica qué falta. */
  motivo?: string;
}
