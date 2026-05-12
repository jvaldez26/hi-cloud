import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CxPService } from './cxp.service';
import { CxPController } from './cxp.controller';
import { CuentaPorPagar } from './entities/cuenta-por-pagar.entity';
import { PagoRealizado } from './entities/pago-realizado.entity';
import { Compra } from '../compras/entities/compra.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CuentaPorPagar, PagoRealizado, Compra]),
    ContabilidadModule,
    TesoreriaModule,
  ],
  controllers: [CxPController],
  providers: [CxPService],
  exports: [CxPService],
})
export class CxPModule {}
