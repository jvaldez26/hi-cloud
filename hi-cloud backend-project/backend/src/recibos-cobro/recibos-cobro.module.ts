import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecibosCobrosController } from './recibos-cobro.controller';
import { RecibosCobrosService } from './recibos-cobro.service';
import { ReciboPDFService } from './recibo-pdf.service';
import { ReciboCobro } from './entities/recibo-cobro.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReciboCobro])],
  controllers: [RecibosCobrosController],
  providers: [RecibosCobrosService, ReciboPDFService],
  exports: [RecibosCobrosService],
})
export class RecibosCobrosModule {}
