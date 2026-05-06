import { Module } from '@nestjs/common';
import { LibroVentasController } from './libro-ventas.controller';
import { LibroVentasService } from './libro-ventas.service';

@Module({
  controllers: [LibroVentasController],
  providers: [LibroVentasService],
  exports: [LibroVentasService],
})
export class LibroVentasModule {}
