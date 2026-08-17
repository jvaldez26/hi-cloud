import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GastosImportacionService }    from './gastos-importacion.service';
import { GastosImportacionController } from './gastos-importacion.controller';
import { GastoImportacion }            from './entities/gasto-importacion.entity';
import { GastoImportacionLinea }       from './entities/gasto-importacion-linea.entity';
import { CompraDetalle }               from '../compras/entities/compra-detalle.entity';
import { Compra }                      from '../compras/entities/compra.entity';
import { ContabilidadModule }          from '../contabilidad/contabilidad.module';
import { TenantModule }                from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GastoImportacion, GastoImportacionLinea, CompraDetalle, Compra]),
    ContabilidadModule,
    TenantModule,
  ],
  controllers: [GastosImportacionController],
  providers:   [GastosImportacionService],
  exports:     [GastosImportacionService],
})
export class GastosImportacionModule {}
