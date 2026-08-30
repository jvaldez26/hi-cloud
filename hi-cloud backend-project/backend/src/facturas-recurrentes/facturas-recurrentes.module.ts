import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { FacturasRecurrentesService } from './facturas-recurrentes.service';
import { FacturasRecurrentesController } from './facturas-recurrentes.controller';
import { GeneracionRecurrenteService } from './services/generacion-recurrente.service';
import { EmisionRecurrenteService } from './services/emision-recurrente.service';
import { FacturaRecurrente } from './entities/factura-recurrente.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { EmailService } from '../notificaciones/services/email.service';
import { FacturasModule } from '../facturas/facturas.module';
import { VendedorResolverModule } from '../facturas/vendedor/vendedor-resolver.module';
import { RncModule } from '../rnc/rnc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaRecurrente, Factura, FacturaDetalle]),
    ConfigModule,
    FacturasModule,
    // El vendedor de la factura generada sale del dueño de la plantilla. El
    // resolver no lee el CLS —recibe usuarioId y empresaId explícitos—, así que
    // es seguro llamarlo desde el cron.
    VendedorResolverModule,
    // Vigencia del RNC del comprador antes de emitir un comprobante de credito fiscal.
    RncModule,
  ],
  controllers: [FacturasRecurrentesController],
  providers: [
    FacturasRecurrentesService,
    GeneracionRecurrenteService,
    EmisionRecurrenteService,
    EmailService,
  ],
  exports: [FacturasRecurrentesService],
})
export class FacturasRecurrentesModule {}
