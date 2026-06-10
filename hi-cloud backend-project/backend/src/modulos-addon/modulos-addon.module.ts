import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuloAddon } from './entities/modulo-addon.entity';
import { EmpresaModulo } from './entities/empresa-modulo.entity';
import { ModulosAddonService } from './modulos-addon.service';
import { ModulosAddonController } from './modulos-addon.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ModuloAddon, EmpresaModulo])],
  providers: [ModulosAddonService],
  controllers: [ModulosAddonController],
  exports: [ModulosAddonService],
})
export class ModulosAddonModule {}
