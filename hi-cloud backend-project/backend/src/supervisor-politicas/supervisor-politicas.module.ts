import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupervisorPolitica } from './entities/supervisor-politica.entity';
import { SupervisorAutorizacion } from './entities/supervisor-autorizacion.entity';
import { SupervisorPoliticaService } from './supervisor-politica.service';
import { SupervisorPoliticasController } from './supervisor-politicas.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupervisorPolitica, SupervisorAutorizacion]),
    AuditoriaModule,
  ],
  controllers: [SupervisorPoliticasController],
  providers: [SupervisorPoliticaService],
  exports: [SupervisorPoliticaService],
})
export class SupervisorPoliticasModule {}
