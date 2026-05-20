import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecibosCobrosController } from './recibos-cobro.controller';
import { RecibosCobrosService } from './recibos-cobro.service';
import { ReciboPDFService } from './recibo-pdf.service';
import { ReciboCobro } from './entities/recibo-cobro.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { AnticipoCliente } from '../anticipos-cliente/entities/anticipo-cliente.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { TesoreriaModule } from '../tesoreria/tesoreria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReciboCobro, CuentaPorCobrar, Factura, AnticipoCliente]),
    ContabilidadModule,
    TesoreriaModule,
  ],
  controllers: [RecibosCobrosController],
  providers: [RecibosCobrosService, ReciboPDFService],
  exports: [RecibosCobrosService],
})
export class RecibosCobrosModule {}
