import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotasCreditoController } from './notas-credito.controller';
import { NotasCreditoService } from './notas-credito.service';
import { NotaCreditoPDFService } from './nc-pdf.service';
import { NotaCredito } from './entities/nota-credito.entity';
import { NotaCreditoDetalle } from './entities/nota-credito-detalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotaCredito, NotaCreditoDetalle])],
  controllers: [NotasCreditoController],
  providers: [NotasCreditoService, NotaCreditoPDFService],
  exports: [NotasCreditoService],
})
export class NotasCreditoModule {}
