import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositosController } from './depositos.controller';
import { DepositosService } from './depositos.service';
import { DepositoBancario } from './entities/deposito-bancario.entity';
import { CuentaBancaria } from '../bancos/entities/cuenta-bancaria.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DepositoBancario, CuentaBancaria])],
  controllers: [DepositosController],
  providers: [DepositosService],
  exports: [DepositosService],
})
export class DepositosModule {}
