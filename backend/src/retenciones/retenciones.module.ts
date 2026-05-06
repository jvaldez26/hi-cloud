import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetencionesService } from './retenciones.service';
import { RetencionesController } from './retenciones.controller';
import { RetencionISR } from './entities/retencion-isr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RetencionISR])],
  controllers: [RetencionesController],
  providers: [RetencionesService],
  exports: [RetencionesService],
})
export class RetencionesModule {}
