import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendedoresController } from './vendedores.controller';
import { VendedoresService } from './vendedores.service';
import { Vendedor } from './entities/vendedor.entity';
import { AsignacionClienteVendedor } from './entities/asignacion-cliente.entity';
import { Cliente } from '../clientes/entities/cliente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vendedor, AsignacionClienteVendedor, Cliente])],
  controllers: [VendedoresController],
  providers: [VendedoresService],
  exports: [VendedoresService],
})
export class VendedoresModule {}
