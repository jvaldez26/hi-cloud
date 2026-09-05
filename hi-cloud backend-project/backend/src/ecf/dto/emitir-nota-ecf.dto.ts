import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

/**
 * DTO para emitir e-CF E34 (Nota de Crédito).
 *
 * `codigoModificacion` NO se acepta aquí: se fijó al crear la nota
 * (`POST /notas-credito`) y el endpoint lo lee de esa fila — pedirlo nuevo acá
 * era redundante (y un vector para enviar uno distinto al que se validó en
 * creación). Ver `ecf.controller#emitirEcfNotaCredito`.
 */
export class EmitirEcfNotaCreditoDto {
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
