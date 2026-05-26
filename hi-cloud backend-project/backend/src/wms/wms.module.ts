import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WmsService } from './wms.service';
import { WmsController } from './wms.controller';
import { UbicacionAlmacen } from './entities/ubicacion-almacen.entity';
import { OrdenPicking } from './entities/orden-picking.entity';
import { OrdenPickingLinea } from './entities/orden-picking-linea.entity';
import { InventarioModule } from '../inventario/inventario.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UbicacionAlmacen, OrdenPicking, OrdenPickingLinea]),
    InventarioModule,
  ],
  controllers: [WmsController],
  providers: [WmsService],
  exports: [WmsService],
})
export class WmsModule {}
