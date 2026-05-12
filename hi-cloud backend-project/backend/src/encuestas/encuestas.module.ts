import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncuestasController } from './encuestas.controller';
import { EncuestasService } from './encuestas.service';
import { Encuesta } from './entities/encuesta.entity';
import { RespuestaEncuesta } from './entities/respuesta-encuesta.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Encuesta, RespuestaEncuesta])],
  controllers: [EncuestasController],
  providers: [EncuestasService],
  exports: [EncuestasService],
})
export class EncuestasModule {}
