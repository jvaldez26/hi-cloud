import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CRMController } from './crm.controller';
import { CRMService } from './crm.service';
import { Lead } from './entities/lead.entity';
import { Oportunidad } from './entities/oportunidad.entity';
import { ActividadCRM } from './entities/actividad-crm.entity';

@Module({
  imports: [SuscripcionesModule, TypeOrmModule.forFeature([Lead, Oportunidad, ActividadCRM])],
  controllers: [CRMController],
  providers: [CRMService],
  exports: [CRMService],
})
export class CRMModule {}
