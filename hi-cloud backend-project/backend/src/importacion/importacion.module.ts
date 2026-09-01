import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportacionService } from './importacion.service';
import { ImportacionController } from './importacion.controller';
import { Cliente }    from '../clientes/entities/cliente.entity';
import { Producto }   from '../productos/entities/producto.entity';
import { Proveedor }  from '../proveedores/entities/proveedor.entity';
import { ProductosModule } from '../productos/productos.module';

@Module({
  // ProductosModule por ProductoProveedorService: la importación crea el vínculo
  // producto↔proveedor cuando el CSV trae la columna `proveedor`.
  imports: [TypeOrmModule.forFeature([Cliente, Producto, Proveedor]), ProductosModule],
  controllers: [ImportacionController],
  providers: [ImportacionService],
})
export class ImportacionModule {}
