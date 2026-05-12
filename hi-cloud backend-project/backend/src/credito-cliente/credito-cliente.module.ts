import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditoClienteController } from './credito-cliente.controller';
import { CreditoClienteService } from './credito-cliente.service';
import { CreditoCliente } from './entities/credito-cliente.entity';
import { Cliente } from '../clientes/entities/cliente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CreditoCliente, Cliente])],
  controllers: [CreditoClienteController],
  providers: [CreditoClienteService],
  exports: [CreditoClienteService],
})
export class CreditoClienteModule {}
