import { IsArray, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AjusteLineaDto {
  @IsInt()
  compraDetalleId: number;

  @IsNumber()
  @Min(0)
  montoAsignado: number;
}

export class AjustarLineasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AjusteLineaDto)
  lineas: AjusteLineaDto[];
}
