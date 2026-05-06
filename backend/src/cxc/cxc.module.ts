import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CxCService } from './cxc.service';
import { CxCController } from './cxc.controller';
import { CuentaPorCobrar } from './entities/cuenta-por-cobrar.entity';
import { PagoCobrado } from './entities/pago-cobrado.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CuentaPorCobrar, PagoCobrado, Factura]),
    ContabilidadModule,
    TesoreriaModule,
  ],
  controllers: [CxCController],
  providers: [CxCService],
  exports: [CxCService],
})
export class CxCModule {}
