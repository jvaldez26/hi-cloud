import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcfRecibidosController } from './ecf-recibidos.controller';
import { EcfRecibidosService } from './ecf-recibidos.service';
import { EcfRecibido } from './entities/ecf-recibido.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EcfRecibido])],
  controllers: [EcfRecibidosController],
  providers: [EcfRecibidosService],
  exports: [EcfRecibidosService],
})
export class EcfRecibidosModule {}
