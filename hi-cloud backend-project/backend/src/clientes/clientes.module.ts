import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { Cliente } from './entities/cliente.entity';

import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente]), SuscripcionesModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
