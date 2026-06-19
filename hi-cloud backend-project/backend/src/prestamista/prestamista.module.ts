import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';

import { PrDeudor } from './entities/pr-deudor.entity';
import { PrProductoPrestamo } from './entities/pr-producto-prestamo.entity';
import { PrSolicitud } from './entities/pr-solicitud.entity';
import { PrPrestamo } from './entities/pr-prestamo.entity';
import { PrCuota } from './entities/pr-cuota.entity';
import { PrPago } from './entities/pr-pago.entity';
import { PrGarantia } from './entities/pr-garantia.entity';
import { PrGarante } from './entities/pr-garante.entity';
import { PrCobranza } from './entities/pr-cobranza.entity';
import { PrRefinanciamiento } from './entities/pr-refinanciamiento.entity';

import { DeudoresService } from './deudores/deudores.service';
import { DeudoresController } from './deudores/deudores.controller';
import { ProductosPrestamoService } from './productos-prestamo/productos-prestamo.service';
import { ProductosPrestamoController } from './productos-prestamo/productos-prestamo.controller';
import { SolicitudesService } from './solicitudes/solicitudes.service';
import { SolicitudesController } from './solicitudes/solicitudes.controller';
import { PrestamosService } from './prestamos/prestamos.service';
import { PrestamosController } from './prestamos/prestamos.controller';
import { PagosService } from './pagos/pagos.service';
import { PagosController } from './pagos/pagos.controller';
import { GarantiasService } from './garantias/garantias.service';
import { GarantiasController } from './garantias/garantias.controller';
import { CobranzaService } from './cobranza/cobranza.service';
import { CobranzaController } from './cobranza/cobranza.controller';
import { MoraCronService } from './cobranza/mora.cron';
import { RefinanciamientoService } from './refinanciamiento/refinanciamiento.service';
import { RefinanciamientoController } from './refinanciamiento/refinanciamiento.controller';
import { DashboardPrestamistaService } from './dashboard/dashboard.service';
import { DashboardPrestamistaController } from './dashboard/dashboard.controller';
import { PrestamistaPdfService } from './pdf/prestamista-pdf.service';
import { PdfPrestamistaController } from './pdf/pdf.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PrDeudor,
      PrProductoPrestamo,
      PrSolicitud,
      PrPrestamo,
      PrCuota,
      PrPago,
      PrGarantia,
      PrGarante,
      PrCobranza,
      PrRefinanciamiento,
    ]),
    TenantModule,
  ],
  providers: [
    DeudoresService,
    ProductosPrestamoService,
    SolicitudesService,
    PrestamosService,
    PagosService,
    GarantiasService,
    CobranzaService,
    MoraCronService,
    RefinanciamientoService,
    DashboardPrestamistaService,
    PrestamistaPdfService,
  ],
  controllers: [
    DeudoresController,
    ProductosPrestamoController,
    SolicitudesController,
    PrestamosController,
    PagosController,
    GarantiasController,
    CobranzaController,
    RefinanciamientoController,
    DashboardPrestamistaController,
    PdfPrestamistaController,
  ],
  exports: [DeudoresService, PrestamosService],
})
export class PrestamistatModule {}
