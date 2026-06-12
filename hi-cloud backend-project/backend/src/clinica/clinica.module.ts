import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Paciente } from './entities/paciente.entity';
import { Medico } from './entities/medico.entity';
import { Cita } from './entities/cita.entity';
import { Consulta } from './entities/consulta.entity';
import { Receta } from './entities/receta.entity';
import { RecetaMedicamento } from './entities/receta-medicamento.entity';
import { OrdenLaboratorio } from './entities/orden-laboratorio.entity';
import { ExamenLaboratorio } from './entities/examen-laboratorio.entity';
import { Procedimiento } from './entities/procedimiento.entity';
import { AutorizacionArs } from './entities/autorizacion-ars.entity';
import { CatalogoServicioClinica } from './entities/catalogo-servicio-clinica.entity';
import { SalaEspera } from './entities/sala-espera.entity';
import { SignosVitales } from './entities/signos-vitales.entity';
import { ClinicaService } from './clinica.service';
import { ClinicaController } from './clinica.controller';
import { ClinicaPdfService } from './clinica-pdf.service';
import { PreFacturaModule } from '../pre-factura/pre-factura.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Paciente, Medico, Cita, Consulta, Receta, RecetaMedicamento,
      OrdenLaboratorio, ExamenLaboratorio, Procedimiento,
      AutorizacionArs, CatalogoServicioClinica, SalaEspera, SignosVitales,
    ]),
    PreFacturaModule,
  ],
  providers: [ClinicaService, ClinicaPdfService],
  controllers: [ClinicaController],
  exports: [ClinicaService],
})
export class ClinicaModule {}
