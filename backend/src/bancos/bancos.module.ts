import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BancosController } from './bancos.controller';
import { BancosService } from './bancos.service';
import { ExtractoParserService } from './extracto-parser.service';
import { CuentaBancaria } from './entities/cuenta-bancaria.entity';
import { MovimientoBancario } from './entities/movimiento-bancario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaBancaria, MovimientoBancario])],
  controllers: [BancosController],
  providers: [BancosService, ExtractoParserService],
  exports: [BancosService, ExtractoParserService],
})
export class BancosModule {}
