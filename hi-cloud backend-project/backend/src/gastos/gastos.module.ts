import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GastosService } from './gastos.service';
import { GastoPDFService } from './gasto-pdf.service';
import { GastosController } from './gastos.controller';
import { Gasto } from './entities/gasto.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';
import { ECFModule } from '../ecf/ecf.module';

@Module({
  imports: [TypeOrmModule.forFeature([Gasto]), ContabilidadModule, ECFModule],
  controllers: [GastosController],
  providers: [GastosService, GastoPDFService],
  exports: [GastosService],
})
export class GastosModule {}
