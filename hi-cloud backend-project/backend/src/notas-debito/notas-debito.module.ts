import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotasDebitoController } from './notas-debito.controller';
import { NotasDebitoService } from './notas-debito.service';
import { NotaDebitoPDFService } from './nota-pdf.service';
import { NotaDebito } from './entities/nota-debito.entity';
import { NotaDebitoDetalle } from './entities/nota-debito-detalle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotaDebito, NotaDebitoDetalle])],
  controllers: [NotasDebitoController],
  providers: [NotasDebitoService, NotaDebitoPDFService],
  exports: [NotasDebitoService],
})
export class NotasDebitoModule {}
