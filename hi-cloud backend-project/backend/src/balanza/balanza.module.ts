import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanzaPatron } from './entities/balanza-patron.entity';
import { BalanzaFormatoExportacion } from './entities/balanza-formato-exportacion.entity';
import { BalanzaService } from './balanza.service';
import { BalanzaController } from './balanza.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanzaPatron, BalanzaFormatoExportacion]),
  ],
  controllers: [BalanzaController],
  providers:   [BalanzaService],
  exports:     [BalanzaService],  // por si otros módulos necesitan parsear
})
export class BalanzaModule {}
