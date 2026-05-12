import { Module } from '@nestjs/common';
import { AlertasSistemaController } from './alertas-sistema.controller';
import { AlertasSistemaService } from './alertas-sistema.service';

@Module({
  controllers: [AlertasSistemaController],
  providers: [AlertasSistemaService],
  exports: [AlertasSistemaService],
})
export class AlertasSistemaModule {}
