import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmaciaController } from './farmacia.controller';
import { FarmaciaService } from './farmacia.service';
import { FarmaciaPdfService } from './farmacia-pdf.service';
import { Medicamento } from './entities/medicamento.entity';
import { Lote } from './entities/lote.entity';
import { Dispensacion } from './entities/dispensacion.entity';
import { DispensacionItem } from './entities/dispensacion-item.entity';
import { ControlNarcotico } from './entities/control-narcotico.entity';
import { Recepcion } from './entities/recepcion.entity';
import { RecepcionItem } from './entities/recepcion-item.entity';
import { Devolucion } from './entities/devolucion.entity';
import { ReclamacionArs } from './entities/reclamacion-ars.entity';
import { AlertaFarmacia } from './entities/alerta-farmacia.entity';
import { TenantModule } from '../tenant/tenant.module';
import { ModulosAddonModule } from '../modulos-addon/modulos-addon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Medicamento, Lote, Dispensacion, DispensacionItem, ControlNarcotico,
      Recepcion, RecepcionItem, Devolucion, ReclamacionArs, AlertaFarmacia,
    ]),
    TenantModule,
    ModulosAddonModule,
  ],
  controllers: [FarmaciaController],
  providers: [FarmaciaService, FarmaciaPdfService],
})
export class FarmaciaModule {}
