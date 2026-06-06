import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuotasController, PlanesPagoController } from './cuotas.controller';
import { CuotasService } from './cuotas.service';
import { PlanPago } from './entities/plan-pago.entity';
import { Cuota } from './entities/cuota.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlanPago, Cuota])],
  controllers: [CuotasController, PlanesPagoController],
  providers: [CuotasService],
  exports: [CuotasService],
})
export class CuotasModule {}
