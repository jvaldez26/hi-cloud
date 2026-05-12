import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotasCreditoComprasController } from './notas-credito-compras.controller';
import { NotasCreditoComprasService } from './notas-credito-compras.service';
import { NotaCreditoCompra } from './entities/nota-credito-compra.entity';
import { NotaCreditoCompraDetalle } from './entities/nota-credito-compra-detalle.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotaCreditoCompra, NotaCreditoCompraDetalle, Producto])],
  controllers: [NotasCreditoComprasController],
  providers: [NotasCreditoComprasService],
  exports: [NotasCreditoComprasService],
})
export class NotasCreditoComprasModule {}
