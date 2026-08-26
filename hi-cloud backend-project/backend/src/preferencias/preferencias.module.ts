import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreferenciaUsuario } from './entities/preferencia-usuario.entity';
import { PreferenciasService } from './preferencias.service';
import { PreferenciasController } from './preferencias.controller';

@Module({
  imports:     [TypeOrmModule.forFeature([PreferenciaUsuario])],
  controllers: [PreferenciasController],
  providers:   [PreferenciasService],
  exports:     [PreferenciasService],
})
export class PreferenciasModule {}
