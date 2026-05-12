import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para emitir e-CF E33 (Nota de Débito). */
export class EmitirEcfNotaDebitoDto {
  @ApiPropertyOptional({
    description: 'e-NCF del comprobante original. Si se omite, se resuelve automáticamente desde la factura original de la nota.',
    example: 'E310000000001',
  })
  @IsString()
  @IsOptional()
  ncfModificado?: string;

  @ApiPropertyOptional({
    description: 'Fecha del comprobante original DD-MM-YYYY. Requerido si ncfModificado se provee manualmente.',
    example: '01-05-2026',
  })
  @IsString()
  @IsOptional()
  fechaNcfModificado?: string;
}

/** DTO para emitir e-CF E34 (Nota de Crédito). */
export class EmitirEcfNotaCreditoDto {
  @ApiProperty({
    description:
      'Código de modificación (STRING): ' +
      '"1"=Anulación total, "2"=Corrección de texto, ' +
      '"3"=Corrección de montos, "4"=Reemplazo de contingencia, ' +
      '"5"=Referencia a Factura de Consumo.',
    enum: ['1', '2', '3', '4', '5'],
    example: '3',
  })
  @IsString()
  @IsIn(['1', '2', '3', '4', '5'])
  codigoModificacion!: string;

  @ApiPropertyOptional({
    description: 'e-NCF del comprobante original. Se resuelve automáticamente si se omite.',
    example: 'E310000000001',
  })
  @IsString()
  @IsOptional()
  ncfModificado?: string;

  @ApiPropertyOptional({
    description: 'Fecha del comprobante original DD-MM-YYYY.',
    example: '01-05-2026',
  })
  @IsString()
  @IsOptional()
  fechaNcfModificado?: string;
}
