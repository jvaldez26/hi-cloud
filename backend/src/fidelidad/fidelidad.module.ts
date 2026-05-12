import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FidelidadController } from './fidelidad.controller';
import { FidelidadService } from './fidelidad.service';
import { ProgramaFidelidad } from './entities/programa-fidelidad.entity';
import { SaldoPuntos } from './entities/saldo-puntos.entity';
import { TransaccionPuntos } from './entities/transaccion-puntos.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProgramaFidelidad, SaldoPuntos, TransaccionPuntos])],
  controllers: [FidelidadController],
  providers: [FidelidadService],
  exports: [FidelidadService],
})
export class FidelidadModule {}
