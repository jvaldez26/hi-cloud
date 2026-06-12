import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehiculo } from './entities/vehiculo.entity';
import { TecnicoTaller } from './entities/tecnico-taller.entity';
import { OrdenTaller } from './entities/orden-taller.entity';
import { OrdenServicio } from './entities/orden-servicio.entity';
import { OrdenRepuesto } from './entities/orden-repuesto.entity';
import { DiagnosticoTaller } from './entities/diagnostico-taller.entity';
import { ChecklistTaller } from './entities/checklist-taller.entity';
import { CitaTaller } from './entities/cita-taller.entity';
import { HistorialMantenimiento } from './entities/historial-mantenimiento.entity';
import { CatalogoServicio } from './entities/catalogo-servicio.entity';
import { TallerService } from './taller.service';
import { TallerController } from './taller.controller';
import { TallerPdfService } from './taller-pdf.service';
import { PreFacturaModule } from '../pre-factura/pre-factura.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vehiculo,
      TecnicoTaller,
      OrdenTaller,
      OrdenServicio,
      OrdenRepuesto,
      DiagnosticoTaller,
      ChecklistTaller,
      CitaTaller,
      HistorialMantenimiento,
      CatalogoServicio,
    ]),
    PreFacturaModule,
  ],
  providers: [TallerService, TallerPdfService],
  controllers: [TallerController],
  exports: [TallerService],
})
export class TallerModule {}
