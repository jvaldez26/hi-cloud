import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComprasService }    from './compras.service';
import { ComprasPdfService } from './compras-pdf.service';
import { ComprasController } from './compras.controller';
import { Compra }            from './entities/compra.entity';
import { CompraDetalle }     from './entities/compra-detalle.entity';
import { Empresa }           from '../configuracion/entities/empresa.entity';
import { ProveedoresModule } from '../proveedores/proveedores.module';
import { ProductosModule }   from '../productos/productos.module';
import { InventarioModule }  from '../inventario/inventario.module';
import { CxPModule }         from '../cxp/cxp.module';
import { ContabilidadModule }from '../contabilidad/contabilidad.module';
import { TenantModule }      from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Compra, CompraDetalle, Empresa]),
    ProveedoresModule, ProductosModule, InventarioModule,
    CxPModule, ContabilidadModule, TenantModule,
  ],
  controllers: [ComprasController],
  providers:   [ComprasService, ComprasPdfService],
  exports:     [ComprasService, ComprasPdfService],
})
export class ComprasModule {}
