import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjetivosController } from './objetivos.controller';
import { ObjetivosService } from './objetivos.service';
import { Objetivo } from './entities/objetivo.entity';
import { ResultadoClave } from './entities/resultado-clave.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Objetivo, ResultadoClave])],
  controllers: [ObjetivosController],
  providers: [ObjetivosService],
  exports: [ObjetivosService],
})
export class ObjetivosModule {}
