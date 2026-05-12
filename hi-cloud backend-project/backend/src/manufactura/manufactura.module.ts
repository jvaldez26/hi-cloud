import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManufacturaController } from './manufactura.controller';
import { ManufacturaService } from './manufactura.service';
import { ManufacturaAvanzadaService } from './manufactura-avanzada.service';
import { ListaMateriales } from './entities/lista-materiales.entity';
import { ComponenteLM } from './entities/componente-lm.entity';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { CentroTrabajo } from './entities/centro-trabajo.entity';
import { RutaProduccion } from './entities/ruta-produccion.entity';
import { EtapaRuta } from './entities/etapa-ruta.entity';
import { RegistroEtapaOrden } from './entities/registro-etapa-orden.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    ListaMateriales, ComponenteLM, OrdenProduccion, Producto,
    CentroTrabajo, RutaProduccion, EtapaRuta, RegistroEtapaOrden,
  ])],
  controllers: [ManufacturaController],
  providers: [ManufacturaService, ManufacturaAvanzadaService],
  exports: [ManufacturaService, ManufacturaAvanzadaService],
})
export class ManufacturaModule {}
