import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresupuestosService } from './presupuestos.service';
import { PresupuestoPDFService } from './presupuesto-pdf.service';
import { PresupuestosController } from './presupuestos.controller';
import { Presupuesto } from './entities/presupuesto.entity';
import { PresupuestoLinea } from './entities/presupuesto-linea.entity';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Presupuesto, PresupuestoLinea])],
  controllers: [PresupuestosController],
  providers: [PresupuestosService, PresupuestoPDFService, BrowserService],
  exports: [PresupuestosService],
})
export class PresupuestosModule {}
