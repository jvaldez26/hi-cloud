import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroFiscal } from './entities/parametro-fiscal.entity';
import { ParametrosFiscalesService } from './parametros-fiscales.service';
import { ParametrosFiscalesController } from './parametros-fiscales.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroFiscal]), AuditoriaModule],
  controllers: [ParametrosFiscalesController],
  providers: [ParametrosFiscalesService],
  exports: [ParametrosFiscalesService],
})
export class ParametrosFiscalesModule {}
