import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportacionService } from './importacion.service';
import { ImportacionController } from './importacion.controller';
import { Cliente }    from '../clientes/entities/cliente.entity';
import { Producto }   from '../productos/entities/producto.entity';
import { Proveedor }  from '../proveedores/entities/proveedor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Producto, Proveedor])],
  controllers: [ImportacionController],
  providers: [ImportacionService],
})
export class ImportacionModule {}
