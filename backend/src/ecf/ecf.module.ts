import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ECFService } from './ecf.service';
import { ECFController } from './ecf.controller';
import { ECFHttpService } from './services/ecf-http.service';
import { ECF } from './entities/ecf.entity';
import { TipoECF } from './entities/tipo-ecf.entity';
import { SecuenciaECF } from './entities/secuencia-ecf.entity';
import { ProveedorECF } from './entities/proveedor-ecf.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { Cliente } from '../clientes/entities/cliente.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ECF, TipoECF, SecuenciaECF, ProveedorECF, Factura, Cliente]),
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    ConfigModule, SuscripcionesModule,
  ],
  controllers: [ECFController],
  providers: [ECFService, ECFHttpService],
  exports: [ECFService],
})
export class ECFModule {}
