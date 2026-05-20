import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnticiposClienteController } from './anticipos-cliente.controller';
import { AnticiposClienteService } from './anticipos-cliente.service';
import { AnticipoCliente } from './entities/anticipo-cliente.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnticipoCliente, CuentaPorCobrar, Factura]),
    ContabilidadModule,
  ],
  controllers: [AnticiposClienteController],
  providers:   [AnticiposClienteService],
  exports:     [AnticiposClienteService],
})
export class AnticiposClienteModule {}
