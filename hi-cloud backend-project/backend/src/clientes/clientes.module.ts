import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { Cliente } from './entities/cliente.entity';

import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { BrowserService } from '../common/services/browser.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente]), SuscripcionesModule],
  controllers: [ClientesController],
  providers: [ClientesService, BrowserService],
  exports: [ClientesService],
})
export class ClientesModule {}
