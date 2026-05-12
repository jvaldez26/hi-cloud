import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentasEstadisticasService } from './cuentas-estadisticas.service';
import { CuentasEstadisticasController } from './cuentas-estadisticas.controller';
import { CuentaEstadistica } from './entities/cuenta-estadistica.entity';
import { MovimientoEstadistico } from './entities/movimiento-estadistico.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaEstadistica, MovimientoEstadistico])],
  controllers: [CuentasEstadisticasController],
  providers: [CuentasEstadisticasService],
  exports: [CuentasEstadisticasService],
})
export class CuentasEstadisticasModule {}
