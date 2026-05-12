import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GastosService } from './gastos.service';
import { GastosController } from './gastos.controller';
import { Gasto } from './entities/gasto.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [TypeOrmModule.forFeature([Gasto]), ContabilidadModule],
  controllers: [GastosController],
  providers: [GastosService],
  exports: [GastosService],
})
export class GastosModule {}
