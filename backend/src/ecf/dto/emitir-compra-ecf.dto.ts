import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para emitir e-CF E41 (Comprobante de Compras). No requiere campos extra. */
export class EmitirEcfCompraDto {}

/** DTO para emitir e-CF E43 (Gastos Menores). No requiere campos extra. */
export class EmitirEcfGastoDto {}

/** DTO para emitir e-CF E47 (Pago al Exterior). */
export class EmitirEcfPagoExteriorDto {
  @ApiProperty({
    description: 'Nombre del beneficiario extranjero.',
    example: 'Acme Corp',
  })
  @IsString()
  nombreExtranjero!: string;

  @ApiProperty({
    description: 'País del beneficiario — código ISO 2 letras.',
    example: 'US',
  })
  @IsString()
  paisExtranjero!: string;
}

/** DTO para emitir e-CF E46 (Exportaciones). */
export class EmitirEcfExportacionDto {
  @ApiProperty({
    description: 'Nombre del cliente extranjero.',
    example: 'Global Imports Ltd',
  })
  @IsString()
  nombreExtranjero!: string;

  @ApiProperty({
    description: 'País del cliente — código ISO 2 letras.',
    example: 'MX',
  })
  @IsString()
  paisExtranjero!: string;
}
