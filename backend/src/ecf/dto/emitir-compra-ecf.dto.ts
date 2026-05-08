import { IsString, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OtraMonedaDto {
  @ApiProperty({ description: 'Código de moneda ISO 4217', example: 'USD' })
  @IsString()
  Moneda!: string;

  @ApiProperty({ description: 'Tipo de cambio DOP por unidad de moneda extranjera', example: 58.5 })
  @IsNumber()
  @Min(0.0001)
  TipoCambio!: number;

  @ApiProperty({ description: 'Monto total en la moneda extranjera', example: 1000 })
  @IsNumber()
  @Min(0)
  MontoTotal!: number;
}

/** DTO para emitir e-CF E41 (Comprobante de Compras). No requiere campos extra. */
export class EmitirEcfCompraDto {}

/** DTO para emitir e-CF E43 (Gastos Menores). No requiere campos extra. */
export class EmitirEcfGastoDto {}

/** DTO para emitir e-CF E47 (Pago al Exterior). */
export class EmitirEcfPagoExteriorDto {
  @ApiPropertyOptional({
    description: 'Datos de la moneda extranjera del pago.',
  })
  @ValidateNested()
  @Type(() => OtraMonedaDto)
  @IsOptional()
  otraMoneda?: OtraMonedaDto;

  @ApiPropertyOptional({
    description: 'Porcentaje de retención ISR. Por defecto 27% (estándar DGII para pagos al exterior).',
    example: 27,
  })
  @IsNumber()
  @IsOptional()
  retencionISR?: number;
}

/** DTO para emitir e-CF E46 (Exportaciones) desde una factura existente. */
export class EmitirEcfExportacionDto {
  @ApiPropertyOptional({
    description: 'Datos de la moneda extranjera.',
  })
  @ValidateNested()
  @Type(() => OtraMonedaDto)
  @IsOptional()
  otraMoneda?: OtraMonedaDto;

  @ApiPropertyOptional({
    description: 'Tipo de venta: 1=Directa, 2=Consignación, 3=Otra.',
    enum: [1, 2, 3],
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  tipoVenta?: number;

  @ApiPropertyOptional({
    description: 'Tipo de exportación: 1=Bienes, 2=Servicios.',
    enum: [1, 2],
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  tipoExportacion?: number;
}
