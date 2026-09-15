import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModuloAddon } from './entities/modulo-addon.entity';
import { EmpresaModulo } from './entities/empresa-modulo.entity';
import { ModulosAddonService } from './modulos-addon.service';
import { ModulosAddonController } from './modulos-addon.controller';
import { ModulosAddonPublicoController } from './modulos-addon-publico.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ModuloAddon, EmpresaModulo])],
  providers: [ModulosAddonService],
  controllers: [ModulosAddonController, ModulosAddonPublicoController],
  exports: [ModulosAddonService],
})
export class ModulosAddonModule {}
