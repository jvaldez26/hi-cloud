import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PacienteOptica } from './entities/paciente-optica.entity';
import { MedicoOptica } from './entities/medico-optica.entity';
import { CitaOptica } from './entities/cita-optica.entity';
import { ConsultaOptica } from './entities/consulta-optica.entity';
import { RecetaOptica } from './entities/receta-optica.entity';
import { OrdenTrabajoOptica } from './entities/orden-trabajo-optica.entity';
import { ReclamacionArs } from './entities/reclamacion-ars.entity';
import { InventarioOptica } from './entities/inventario-optica.entity';
import { OpticaService } from './optica.service';
import { RecetaPdfService } from './receta-pdf.service';
import { OpticaController } from './optica.controller';
import { PreFacturaModule } from '../pre-factura/pre-factura.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PacienteOptica,
      MedicoOptica,
      CitaOptica,
      ConsultaOptica,
      RecetaOptica,
      OrdenTrabajoOptica,
      ReclamacionArs,
      InventarioOptica,
    ]),
    PreFacturaModule,
  ],
  providers: [OpticaService, RecetaPdfService],
  controllers: [OpticaController],
  exports: [OpticaService],
})
export class OpticaModule {}
