import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivosFijosService } from './activos-fijos.service';
import { ActivosFijosController } from './activos-fijos.controller';
import { CategoriaActivo } from './entities/categoria-activo.entity';
import { ActivoFijo } from './entities/activo-fijo.entity';
import { DepreciacionActivo } from './entities/depreciacion-activo.entity';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoriaActivo, ActivoFijo, DepreciacionActivo]),
    ContabilidadModule,
  ],
  controllers: [ActivosFijosController],
  providers: [ActivosFijosService],
  exports: [ActivosFijosService],
})
export class ActivosFijosModule {}
