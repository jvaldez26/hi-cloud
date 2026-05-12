import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlujoCajaController } from './flujo-caja.controller';
import { FlujoCajaService } from './flujo-caja.service';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Gasto } from '../gastos/entities/gasto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaPorCobrar, CuentaPorPagar, Contrato, Gasto])],
  controllers: [FlujoCajaController],
  providers: [FlujoCajaService],
  exports: [FlujoCajaService],
})
export class FlujoCajaModule {}
