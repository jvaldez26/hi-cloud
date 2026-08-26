import { Module } from '@nestjs/common';
import { VendedorResolverService } from './vendedor-resolver.service';

/**
 * Modulo minimo a proposito: solo necesita el DataSource.
 *
 * Restaurante y Pre-factura tienen que resolver el vendedor, y si para eso
 * tuvieran que importar FacturasModule se arrastrarian ECF, CxC, Contabilidad,
 * Caja y Suscripciones detras — con el riesgo de ciclo que eso trae.
 */
@Module({
  providers: [VendedorResolverService],
  exports:   [VendedorResolverService],
})
export class VendedorResolverModule {}
