import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactosController } from './contactos.controller';
import { ContactosService } from './contactos.service';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Proveedor } from '../proveedores/entities/proveedor.entity';
import { Empleado } from '../nomina/entities/empleado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Proveedor, Empleado])],
  controllers: [ContactosController],
  providers: [ContactosService],
  exports: [ContactosService],
})
export class ContactosModule {}
