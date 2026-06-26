import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrChofer }   from './entities/tr-chofer.entity';
import { TrVehiculo } from './entities/tr-vehiculo.entity';
import { TrViaje }    from './entities/tr-viaje.entity';
import { TenantModule }      from '../tenant/tenant.module';
import { FacturasModule }    from '../facturas/facturas.module';
import { TransporteService }    from './transporte.service';
import { TransporteController } from './transporte.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrChofer, TrVehiculo, TrViaje]),
    TenantModule,
    FacturasModule,
  ],
  controllers: [TransporteController],
  providers:   [TransporteService],
  exports:     [TransporteService],
})
export class TransporteModule {}
