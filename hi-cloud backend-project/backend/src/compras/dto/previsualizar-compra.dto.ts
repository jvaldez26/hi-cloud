import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCompraDto, CreateCompraDetalleDto } from './create-compra.dto';

/**
 * DTO de /compras/previsualizar-asiento — a propósito MÁS PERMISIVO que
 * CreateCompraDto: el frontend llama este endpoint con debounce (~500ms)
 * mientras el usuario sigue escribiendo, así que una línea puede llegar sin
 * precioUnitario (o con cantidad/productoId aún sin completar) en cualquier
 * momento. Con CreateCompraDto (el mismo DTO de create()/update()) eso
 * disparaba un 400 por cada tecla — y esos 400 inundaban la auditoría.
 *
 * ComprasService.previsualizarAsiento() filtra las líneas incompletas antes
 * de calcular — este DTO solo se asegura de que el ValidationPipe global no
 * las rechace antes de llegar ahí. Los valores que SÍ llegan se siguen
 * tipando/acotando igual que en CreateCompraDetalleDto (PartialType solo
 * agrega @IsOptional(), no afloja los demás validadores).
 */
export class PrevisualizarCompraDetalleDto extends PartialType(CreateCompraDetalleDto) {}

export class PrevisualizarCompraDto extends PartialType(OmitType(CreateCompraDto, ['detalles'] as const)) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrevisualizarCompraDetalleDto)
  detalles?: PrevisualizarCompraDetalleDto[];
}
