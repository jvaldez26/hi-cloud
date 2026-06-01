import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComunicacionesController } from './comunicaciones.controller';
import { ComunicacionesService } from './comunicaciones.service';
import { Factura } from '../facturas/entities/factura.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { Cotizacion } from '../cotizaciones/entities/cotizacion.entity';
import { Conduce } from '../conduce/entities/conduce.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { NotaCredito } from '../notas-credito/entities/nota-credito.entity';
import { NotaDebito } from '../notas-debito/entities/nota-debito.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Factura, Cliente, CuentaPorCobrar, Cotizacion, Conduce, Empresa,
      NotaCredito, NotaDebito,
    ]),
  ],
  controllers: [ComunicacionesController],
  providers: [ComunicacionesService],
  exports: [ComunicacionesService],
})
export class ComunicacionesModule {}
