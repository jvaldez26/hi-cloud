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
import { EdAsistencia }   from './entities/ed-asistencia.entity';
import { EdPlanPago }     from './entities/ed-plan-pago.entity';
import { EdCargo }        from './entities/ed-cargo.entity';
import { EdPago }         from './entities/ed-pago.entity';
import { EdBeca }         from './entities/ed-beca.entity';
import { EdEstudianteBeca } from './entities/ed-estudiante-beca.entity';
import { EdNotaPeriodo }  from './entities/ed-nota-periodo.entity';
import { EdDisciplina }   from './entities/ed-disciplina.entity';
import { EdLibro }        from './entities/ed-libro.entity';
import { EdPrestamo }     from './entities/ed-prestamo.entity';
// EdRuta y EdComunicado (más abajo) NO se importan aquí a propósito — ver
// la nota junto a TypeOrmModule.forFeature. EdNotaPeriodo, EdDisciplina,
// EdLibro y EdPrestamo SÍ se importan: sus services ya las usan.

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
import { AcademicoService }       from './academico/academico.service';
import { AcademicoController }   from './academico/academico.controller';
import { ColegiaturaService }    from './colegiatura/colegiatura.service';
import { ColegiaturaController } from './colegiatura/colegiatura.controller';
import { BecasService }          from './becas/becas.service';
import { BecasController }       from './becas/becas.controller';
import { BoletinesService }      from './boletines/boletines.service';
import { BoletinPdfService }     from './boletines/boletin-pdf.service';
import { BoletinesController }   from './boletines/boletines.controller';
import { DisciplinaService }     from './disciplina/disciplina.service';
import { DisciplinaController }  from './disciplina/disciplina.controller';
import { BibliotecaService }     from './biblioteca/biblioteca.service';
import { BibliotecaController }  from './biblioteca/biblioteca.controller';

@Module({
  imports: [
    // EdRuta y EdComunicado existen como entidad (y su tabla ya está
    // migrada) pero NINGÚN service las inyecta — son para transporte y
    // comunicados, los 2 submódulos que aún no tienen API (ver
    // src/educativo/README.md). Sacadas de este forFeature a propósito: no
    // tiene sentido registrar un Repository que nadie usa. Cuando se
    // construya la API de alguno, agregarlo aquí de nuevo — no antes.
    TypeOrmModule.forFeature([
      EdConfig, EdAnioEscolar, EdNivel, EdGrado, EdAsignatura, EdSeccion, EdPeriodo,
      EdEstudiante, EdTutor, EdDocente, EdMatricula,
      EdEvaluacion, EdCalificacion, EdAsistencia,
      EdPlanPago, EdCargo, EdPago, EdBeca, EdEstudianteBeca, EdNotaPeriodo,
      EdDisciplina, EdLibro, EdPrestamo,
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
    AcademicoController,
    ColegiaturaController,
    BecasController,
    BoletinesController,
    DisciplinaController,
    BibliotecaController,
  ],
  providers: [
    EdConfigService,
    EstructuraService,
    EdDashboardService,
    EstudiantesService,
    TutoresService,
    DocentesService,
    MatriculasService,
    AcademicoService,
    ColegiaturaService,
    BecasService,
    BoletinesService,
    BoletinPdfService,
    DisciplinaService,
    BibliotecaService,
  ],
  exports: [EdConfigService, EstructuraService],
})
export class EducativoModule {}
