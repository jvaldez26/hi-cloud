import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';

import { AgFinca } from './entities/ag-finca.entity';
import { AgParcela } from './entities/ag-parcela.entity';
import { AgCultivo } from './entities/ag-cultivo.entity';
import { AgCiclo } from './entities/ag-ciclo.entity';
import { AgLabor } from './entities/ag-labor.entity';
import { AgAplicacionInsumo } from './entities/ag-aplicacion-insumo.entity';
import { AgCosecha } from './entities/ag-cosecha.entity';
import { AgAnimal } from './entities/ag-animal.entity';
import { AgEventoAnimal } from './entities/ag-evento-animal.entity';
import { AgInsumo } from './entities/ag-insumo.entity';
import { AgMaquinaria } from './entities/ag-maquinaria.entity';

import { FincasService } from './fincas/fincas.service';
import { FincasController, ParcelasController } from './fincas/fincas.controller';
import { CultivosService } from './cultivos/cultivos.service';
import { CultivosController } from './cultivos/cultivos.controller';
import { CiclosService } from './ciclos/ciclos.service';
import { CiclosController, LaboresController, AplicacionesController } from './ciclos/ciclos.controller';
import { CosechasService } from './cosechas/cosechas.service';
import { CosechasController } from './cosechas/cosechas.controller';
import { GanaderiaService } from './ganaderia/ganaderia.service';
import { GanaderiaController, GanaderiaResumenController } from './ganaderia/ganaderia.controller';
import { InsumosService } from './insumos/insumos.service';
import { InsumosController } from './insumos/insumos.controller';
import { MaquinariaService } from './maquinaria/maquinaria.service';
import { MaquinariaController } from './maquinaria/maquinaria.controller';
import { AgroDashboardService } from './dashboard/dashboard.service';
import { AgroDashboardController } from './dashboard/dashboard.controller';
import { AgroPdfService } from './pdf/agro-pdf.service';
import { AgroPdfController } from './pdf/pdf.controller';
import { AgroReportesService } from './reportes/reportes.service';
import { AgroReportesController } from './reportes/reportes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgFinca, AgParcela, AgCultivo, AgCiclo, AgLabor,
      AgAplicacionInsumo, AgCosecha, AgAnimal, AgEventoAnimal,
      AgInsumo, AgMaquinaria,
    ]),
    TenantModule,
  ],
  controllers: [
    FincasController, ParcelasController,
    CultivosController,
    CiclosController, LaboresController, AplicacionesController,
    CosechasController,
    GanaderiaController, GanaderiaResumenController,
    InsumosController,
    MaquinariaController,
    AgroDashboardController,
    AgroPdfController,
    AgroReportesController,
  ],
  providers: [
    FincasService,
    CultivosService,
    CiclosService,
    CosechasService,
    GanaderiaService,
    InsumosService,
    MaquinariaService,
    AgroDashboardService,
    AgroPdfService,
    AgroReportesService,
  ],
  exports: [FincasService, CiclosService],
})
export class AgroModule {}
