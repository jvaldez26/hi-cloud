import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TesoreriaService } from './tesoreria.service';
import { TesoreriaController } from './tesoreria.controller';
import { CuentaBancaria } from './entities/cuenta-bancaria.entity';
import { MovimientoBancario } from './entities/movimiento-bancario.entity';
import { ConciliacionBancaria } from './entities/conciliacion-bancaria.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaBancaria, MovimientoBancario, ConciliacionBancaria])],
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
