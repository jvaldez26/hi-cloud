import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreFacturaController } from './pre-factura.controller';
import { PreFacturaService } from './pre-factura.service';
import { PreFactura } from './entities/pre-factura.entity';
import { PreFacturaDetalle } from './entities/pre-factura-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PreFactura, PreFacturaDetalle, Factura])],
  controllers: [PreFacturaController],
  providers: [PreFacturaService],
  exports: [PreFacturaService],
})
export class PreFacturaModule {}
