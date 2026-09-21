import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Edición acotada post-borrador: solo el NCF del proveedor y los dos campos
 * 606 que suelen quedar pendientes de la recepción (tipoBienes, formaPago).
 * A diferencia de `update()` (CreateCompraDto completo, solo en borrador),
 * este DTO nunca toca líneas, montos ni inventario — por eso puede
 * habilitarse en recibida/recibida_parcial/pagada. Ver ComprasService.actualizarNcfProveedor.
 */
export class UpdateNcfProveedorDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroFacturaProveedor?: string;

  @IsOptional()
  @IsString()
  tipoBienes?: string;

  @IsOptional()
  @IsString()
  formaPago?: string;
}
