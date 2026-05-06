import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatafonoController } from './datafono.controller';
import { DatafonoService } from './datafono.service';
import { TerminalDatafono } from './entities/terminal-datafono.entity';
import { TransaccionTarjeta } from './entities/transaccion-tarjeta.entity';
import { ConciliacionDatafono } from './entities/conciliacion-datafono.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TerminalDatafono, TransaccionTarjeta, ConciliacionDatafono])],
  controllers: [DatafonoController],
  providers: [DatafonoService],
  exports: [DatafonoService],
})
export class DatafonoModule {}
