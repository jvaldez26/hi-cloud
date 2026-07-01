import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcfRecibidosController } from './ecf-recibidos.controller';
import { EcfRecibidosService } from './ecf-recibidos.service';
import { EcfRecibido } from './entities/ecf-recibido.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([EcfRecibido]), SuscripcionesModule],
  controllers: [EcfRecibidosController],
  providers: [EcfRecibidosService],
  exports: [EcfRecibidosService],
})
export class EcfRecibidosModule {}
