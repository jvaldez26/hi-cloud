import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule }  from '../tenant/tenant.module';

import { EdConfig }       from './entities/ed-config.entity';
import { EdAnioEscolar }  from './entities/ed-anio-escolar.entity';
import { EdNivel }        from './entities/ed-nivel.entity';
import { EdGrado }        from './entities/ed-grado.entity';
import { EdAsignatura }   from './entities/ed-asignatura.entity';
import { EdSeccion }      from './entities/ed-seccion.entity';
import { EdPeriodo }      from './entities/ed-periodo.entity';
import { EdEstudiante }   from './entities/ed-estudiante.entity';
import { EdTutor }        from './entities/ed-tutor.entity';
import { EdDocente }      from './entities/ed-docente.entity';
import { EdMatricula }    from './entities/ed-matricula.entity';
import { EdEvaluacion }   from './entities/ed-evaluacion.entity';
import { EdCalificacion } from './entities/ed-calificacion.entity';
import { EdNotaPeriodo }  from './entities/ed-nota-periodo.entity';
import { EdAsistencia }   from './entities/ed-asistencia.entity';
import { EdPlanPago }     from './entities/ed-plan-pago.entity';
import { EdCargo }        from './entities/ed-cargo.entity';
import { EdPago }         from './entities/ed-pago.entity';
import { EdDisciplina }   from './entities/ed-disciplina.entity';
import { EdLibro }        from './entities/ed-libro.entity';
import { EdPrestamo }     from './entities/ed-prestamo.entity';
import { EdRuta }         from './entities/ed-ruta.entity';
import { EdComunicado }   from './entities/ed-comunicado.entity';

import { EdConfigService }       from './config/config.service';
import { EdConfigController }    from './config/config.controller';
import { EstructuraService }     from './estructura/estructura.service';
import { EstructuraController }  from './estructura/estructura.controller';
import { EdDashboardService }    from './dashboard/dashboard.service';
import { EdDashboardController } from './dashboard/dashboard.controller';
import { EstudiantesService }    from './estudiantes/estudiantes.service';
import { EstudiantesController } from './estudiantes/estudiantes.controller';
import { TutoresService }        from './tutores/tutores.service';
import { TutoresController }     from './tutores/tutores.controller';
import { DocentesService }       from './docentes/docentes.service';
import { DocentesController }    from './docentes/docentes.controller';
import { MatriculasService }     from './matriculas/matriculas.service';
import { MatriculasController }  from './matriculas/matriculas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EdConfig, EdAnioEscolar, EdNivel, EdGrado, EdAsignatura, EdSeccion, EdPeriodo,
      EdEstudiante, EdTutor, EdDocente, EdMatricula,
      EdEvaluacion, EdCalificacion, EdNotaPeriodo, EdAsistencia,
      EdPlanPago, EdCargo, EdPago,
      EdDisciplina, EdLibro, EdPrestamo, EdRuta, EdComunicado,
    ]),
    TenantModule,
  ],
  controllers: [
    EdConfigController,
    EstructuraController,
    EdDashboardController,
    EstudiantesController,
    TutoresController,
    DocentesController,
    MatriculasController,
  ],
  providers: [
    EdConfigService,
    EstructuraService,
    EdDashboardService,
    EstudiantesService,
    TutoresService,
    DocentesService,
    MatriculasService,
  ],
  exports: [EdConfigService, EstructuraService],
})
export class EducativoModule {}
