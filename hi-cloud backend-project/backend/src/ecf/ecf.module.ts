import { Module } from '@nestjs/common';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

// Entidades
import { ECF }              from './entities/ecf.entity';
import { TipoECF }          from './entities/tipo-ecf.entity';
import { SecuenciaECF }     from './entities/secuencia-ecf.entity';
import { ProveedorECF }     from './entities/proveedor-ecf.entity';
import { EmpresaEcfConfig } from './entities/empresa-ecf-config.entity';
import { EcfEvento }        from './entities/ecf-evento.entity';
import { Factura }          from '../facturas/entities/factura.entity';
import { Cliente }          from '../clientes/entities/cliente.entity';
import { NotaDebito }       from '../notas-debito/entities/nota-debito.entity';
import { NotaCredito }      from '../notas-credito/entities/nota-credito.entity';
import { Compra }           from '../compras/entities/compra.entity';
import { Gasto }            from '../gastos/entities/gasto.entity';

// Controladores
import { ECFController }        from './ecf.controller';
import { EcfConfigController }  from './controllers/ecf-config.controller';
import { EcfWebhookController } from './controllers/ecf-webhook.controller';

// Servicios
import { ECFService }           from './ecf.service';
import { ECFHttpService }       from './services/ecf-http.service';
import { EcfEncryptionService } from './services/ecf-encryption.service';
import { EcfConfigService }     from './services/ecf-config.service';
import { ENCFGeneratorService } from './services/encf-generator.service';
import { ECFBuilderService }    from './services/ecf-builder.service';
import { MSellerClientService } from './services/mseller-client.service';

// Casos de uso (Fase 4)
import { EmitirECFUseCase } from './use-cases/emitir-ecf.use-case';

// Jobs @Cron (Fase 4)
import { ReintentoECFJob }       from './jobs/reintento-ecf.job';
import { ConsultarEstadoECFJob } from './jobs/consultar-estado-ecf.job';

// Guards
import { SuperAdminGuard }       from '../super-admin/super-admin.guard';
import { TokenBlacklistService } from '../auth/token-blacklist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ECF, TipoECF, SecuenciaECF, ProveedorECF,
      EmpresaEcfConfig, EcfEvento, Factura, Cliente,
      NotaDebito, NotaCredito, Compra, Gasto,
    ]),
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    ConfigModule,
    SuscripcionesModule,
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET requerido (ecf.module)');
        return { secret };
      },
      inject:     [ConfigService],
    }),
  ],
  controllers: [ECFController, EcfConfigController, EcfWebhookController],
  providers: [
    // Servicios base
    ECFService,
    ECFHttpService,
    EcfEncryptionService,
    EcfConfigService,
    // Fase 3
    ENCFGeneratorService,
    ECFBuilderService,
    MSellerClientService,
    // Fase 4 — Caso de uso principal
    EmitirECFUseCase,
    // Fase 4 — Jobs @Cron
    ReintentoECFJob,
    ConsultarEstadoECFJob,
    // Guards
    SuperAdminGuard,
    TokenBlacklistService,
  ],
  exports: [
    ECFService,
    EcfEncryptionService,
    EcfConfigService,
    ENCFGeneratorService,
    ECFBuilderService,
    MSellerClientService,
    EmitirECFUseCase,
    TypeOrmModule,
  ],
})
export class ECFModule {}
