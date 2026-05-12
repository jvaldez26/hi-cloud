import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuscripcionesService } from './suscripciones.service';
import { SuscripcionesController } from './suscripciones.controller';
import { LimitesService } from './limites.service';
import { PlanGuard } from './guards/plan.guard';
import { Suscripcion } from './entities/suscripcion.entity';
import { PlanConfiguracion } from './entities/plan-configuracion.entity';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Suscripcion, PlanConfiguracion]), TenantModule],
  controllers: [SuscripcionesController],
  providers: [SuscripcionesService, LimitesService, PlanGuard],
  exports: [SuscripcionesService, LimitesService, PlanGuard],
})
export class SuscripcionesModule {}
