import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValoracionStockController } from './valoracion-stock.controller';
import { ValoracionStockService } from './valoracion-stock.service';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Producto])],
  controllers: [ValoracionStockController],
  providers: [ValoracionStockService],
  exports: [ValoracionStockService],
})
export class ValoracionStockModule {}
