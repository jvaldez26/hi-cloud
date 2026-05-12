import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { Factura } from '../facturas/entities/factura.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Empleado } from '../nomina/entities/empleado.entity';
import { Lead } from '../crm/entities/lead.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Gasto } from '../gastos/entities/gasto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Factura, Compra, CuentaPorCobrar, CuentaPorPagar,
    Empleado, Lead, Producto, Gasto,
  ])],
  controllers: [KpiController],
  providers: [KpiService],
  exports: [KpiService],
})
export class KpiModule {}
