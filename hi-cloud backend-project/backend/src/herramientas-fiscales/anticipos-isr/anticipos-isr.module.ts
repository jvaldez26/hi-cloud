import { Module } from '@nestjs/common';
import { ParametrosFiscalesModule } from '../../parametros-fiscales/parametros-fiscales.module';
import { AnticiposISRService } from './anticipos-isr.service';
import { AnticiposISRController } from './anticipos-isr.controller';

@Module({
  imports: [ParametrosFiscalesModule],
  controllers: [AnticiposISRController],
  providers: [AnticiposISRService],
})
export class AnticiposISRModule {}
