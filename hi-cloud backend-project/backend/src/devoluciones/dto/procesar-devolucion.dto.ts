import {
  IsInt, IsOptional, IsPositive, IsArray, ValidateNested, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Cantidad que de verdad se recibió para una línea — puede ser menor que
 *  lo facturado (el cliente devolvió menos de lo que pidió la devolución). */
export class AjusteCantidadDevolucionDto {
  @IsInt() @IsPositive()
  detalleId: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  @Type(() => Number)
  cantidad: number;
}

export class ProcesarDevolucionDto {
  /** Almacén donde entra la mercancía recibida. Sin esto, InventarioService
   *  cae al almacén del contexto/por defecto de la empresa. */
  @IsOptional() @IsInt() @IsPositive()
  almacenId?: number;

  /** Solo para líneas donde lo recibido difiere de lo solicitado — las que
   *  no aparecen aquí se procesan por la cantidad completa de la línea. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteCantidadDevolucionDto)
  detalles?: AjusteCantidadDevolucionDto[];
}
