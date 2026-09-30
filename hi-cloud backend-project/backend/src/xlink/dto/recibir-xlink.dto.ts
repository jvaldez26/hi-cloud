import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsPositive, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RecibirXlinkItemDto {
  @IsInt() @IsPositive()
  xlinkDocumentoId!: number;

  /** Catálogo 606 (01-11) — obligatorio para Factura/NC recibidas de proveedor. */
  @IsOptional() @IsIn(['01','02','03','04','05','06','07','08','09','10','11'])
  tipoGasto606?: string;

  @IsOptional() @IsIn(['si', 'no'])
  tipoRetencionIsr?: 'si' | 'no';

  /**
   * Aplicar esta factura sobre una Compra propia que sigue ENVIADA (la OC
   * que le mandamos a este mismo proveedor), en vez de crear una compra
   * nueva. El frontend lo ofrece cuando detecta OCs abiertas del mismo
   * proveedor sin cadena automática (ver xlinkPadreId, que si existe se
   * aplica solo, sin necesitar esto).
   */
  @IsOptional() @IsInt() @IsPositive()
  aplicarSobreCompraId?: number;
}

export class RecibirXlinkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecibirXlinkItemDto)
  items!: RecibirXlinkItemDto[];
}

export interface FaltanteMapeo {
  tipo: 'producto';
  valorExterno: string;
  descripcion: string;
  /** Precio unitario tal como lo facturó la contraparte — sugerido al crear el producto, nunca impuesto. */
  precioReferencia: number;
}

export interface RecibirXlinkResultadoItem {
  xlinkDocumentoId: number;
  ok: boolean;
  error?: string;
  faltantes?: FaltanteMapeo[];
  yaExistia?: boolean;
  documentoGeneradoId?: number;
  numeroGenerado?: string;
}
