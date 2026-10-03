import { Global, Module } from '@nestjs/common';
import { OrigenFacturaValidadoresRegistry } from './origen-factura-validadores.registry';

@Global()
@Module({
  providers: [OrigenFacturaValidadoresRegistry],
  exports: [OrigenFacturaValidadoresRegistry],
})
export class OrigenFacturaModule {}
