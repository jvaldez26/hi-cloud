import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContabilidadService } from './services/contabilidad.service';
import { AsientosAutomaticosService } from './services/asientos-automaticos.service';
import { ContabilidadController } from './contabilidad.controller';
import { CuentaContable } from './entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from './entities/cuenta-anexo-ir2.entity';
import { AsientoContable } from './entities/asiento-contable.entity';
import { AsientoLinea } from './entities/asiento-linea.entity';

@Module({
  imports: [SuscripcionesModule, TypeOrmModule.forFeature([CuentaContable, CuentaAnexoIR2, AsientoContable, AsientoLinea])],
  controllers: [ContabilidadController],
  providers: [ContabilidadService, AsientosAutomaticosService],
  exports: [ContabilidadService, AsientosAutomaticosService],
})
export class ContabilidadModule {}
