import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';
import { GrupoProducto } from './entities/grupo-producto.entity';
import { SegmentoCliente } from './entities/segmento-cliente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GrupoProducto, SegmentoCliente])],
  controllers: [GruposController],
  providers: [GruposService],
  exports: [GruposService],
})
export class GruposModule {}
