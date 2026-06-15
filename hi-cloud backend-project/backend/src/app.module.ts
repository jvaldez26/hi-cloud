import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { QueuesModule } from './queues/queues.module';
import { S3Module }     from './common/s3/s3.module';
import { BrowserModule } from './common/browser.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { ProductosModule } from './productos/productos.module';
import { FacturasModule } from './facturas/facturas.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ComprasModule } from './compras/compras.module';
import { InventarioModule } from './inventario/inventario.module';
import { ECFModule } from './ecf/ecf.module';
import { HealthModule } from './health/health.module';
import { ReportesModule } from './reportes/reportes.module';
import { CxCModule } from './cxc/cxc.module';
import { CxPModule } from './cxp/cxp.module';
import { ContabilidadModule } from './contabilidad/contabilidad.module';
import { NominaModule } from './nomina/nomina.module';
import { TesoreriaModule } from './tesoreria/tesoreria.module';
import { ActivosFijosModule } from './activos-fijos/activos-fijos.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuditInterceptor } from './auditoria/interceptors/audit.interceptor';

import { ConfiguracionModule } from './configuracion/configuracion.module';
import { PresupuestosModule } from './presupuestos/presupuestos.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { MultiEmpresaModule } from './multi-empresa/multi-empresa.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { DevolucionesModule } from './devoluciones/devoluciones.module';
import { ImportacionModule } from './importacion/importacion.module';
import { DemoModule } from './demo/demo.module';
import { SuscripcionesModule } from './suscripciones/suscripciones.module';
import { FacturasRecurrentesModule } from './facturas-recurrentes/facturas-recurrentes.module';
import { RetencionesModule } from './retenciones/retenciones.module';
import { PortalModule } from './portal/portal.module';
import { PreciosModule } from './precios/precios.module';
import { CajaModule } from './caja/caja.module';
import { ComisionesModule } from './comisiones/comisiones.module';
import { ServiciosModule } from './servicios/servicios.module';
import { GastosModule } from './gastos/gastos.module';
import { ContratosModule } from './contratos/contratos.module';
import { VacacionesModule } from './vacaciones/vacaciones.module';
import { CRMModule } from './crm/crm.module';
import { ProyectosModule } from './proyectos/proyectos.module';
import { InvitacionesModule } from './invitaciones/invitaciones.module';
import { DeclaracionesModule } from './declaraciones/declaraciones.module';
import { BancosModule } from './bancos/bancos.module';
import { TSSModule } from './tss/tss.module';
import { CentroCostosModule } from './centro-costos/centro-costos.module';
import { ChequesModule } from './cheques/cheques.module';
import { ManufacturaModule } from './manufactura/manufactura.module';
import { AlmacenesModule } from './almacenes/almacenes.module';
import { CalendarioModule } from './calendario/calendario.module';
import { FlujoCajaModule } from './flujo-caja/flujo-caja.module';
import { MantenimientoModule } from './mantenimiento/mantenimiento.module';
import { EvaluacionesModule } from './evaluaciones/evaluaciones.module';
import { KpiModule } from './kpi/kpi.module';
import { LicitacionesModule } from './licitaciones/licitaciones.module';
import { FlotaModule } from './flota/flota.module';
import { ObjetivosModule } from './objetivos/objetivos.module';
import { DatafonoModule } from './datafono/datafono.module';
import { EncuestasModule } from './encuestas/encuestas.module';
import { CapacitacionModule } from './capacitacion/capacitacion.module';
import { TenantModule } from './tenant/tenant.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { PeriodoContableModule } from './periodo-contable/periodo-contable.module';
import { ReportesFinancierosModule } from './reportes-financieros/reportes-financieros.module';
import { DocumentosModule } from './documentos/documentos.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { RncModule } from './rnc/rnc.module';
import { PreFacturaModule } from './pre-factura/pre-factura.module';
import { ConduceModule } from './conduce/conduce.module';
import { CajaChicaModule } from './caja-chica/caja-chica.module';
import { VendedoresModule } from './vendedores/vendedores.module';
import { EtiquetasModule } from './etiquetas/etiquetas.module';
import { ComunicacionesModule } from './comunicaciones/comunicaciones.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DescuentosModule } from './descuentos/descuentos.module';
import { NotasCreditoModule } from './notas-credito/notas-credito.module';
import { NotasDebitoModule } from './notas-debito/notas-debito.module';
import { GruposModule } from './grupos/grupos.module';
import { DivisasModule } from './divisas/divisas.module';
import { ConteoInventarioModule } from './conteo-inventario/conteo-inventario.module';
import { ValoracionStockModule } from './valoracion-stock/valoracion-stock.module';
import { BusquedaModule } from './busqueda/busqueda.module';
import { DepositosModule } from './depositos/depositos.module';
import { IsrModule } from './isr/isr.module';
import { CreditoClienteModule } from './credito-cliente/credito-cliente.module';
import { GeneradorReportesModule } from './generador-reportes/generador-reportes.module';
import { ContactosModule } from './contactos/contactos.module';
import { AprobacionesModule } from './aprobaciones/aprobaciones.module';
import { AlertasSistemaModule } from './alertas-sistema/alertas-sistema.module';
import { FidelidadModule } from './fidelidad/fidelidad.module';
import { CuotasModule } from './cuotas/cuotas.module';
import { RecibosCobrosModule } from './recibos-cobro/recibos-cobro.module';
import { AnticiposClienteModule } from './anticipos-cliente/anticipos-cliente.module';
import { NotasCreditoComprasModule } from './notas-credito-compras/notas-credito-compras.module';
import { LibroVentasModule } from './libro-ventas/libro-ventas.module';
import { PortalEmpleadoModule } from './portal-empleado/portal-empleado.module';
import { AsistenteModule }         from './asistente/asistente.module';
import { SuperAdminModule }        from './super-admin/super-admin.module';
import { DatabaseModule }          from './database/database.module';
import { SolicitudesCompraModule }    from './solicitudes-compra/solicitudes-compra.module';
import { PlaneacionDemandaModule }        from './planeacion-demanda/planeacion-demanda.module';
import { CuentasEstadisticasModule }     from './cuentas-estadisticas/cuentas-estadisticas.module';
import { WmsModule }                     from './wms/wms.module';
import { AtributosProductoModule }       from './atributos-producto/atributos-producto.module';
import { DistribucionCostosModule }      from './distribucion-costos/distribucion-costos.module';
import { UomModule }                     from './uom/uom.module';
import { PagosSuscripcionModule }        from './pagos-suscripcion/pagos-suscripcion.module';
import { ModulosAddonModule }            from './modulos-addon/modulos-addon.module';
import { OpticaModule }                 from './optica/optica.module';
import { TallerModule }                 from './taller/taller.module';
import { ClinicaModule }               from './clinica/clinica.module';
import { FarmaciaModule }              from './farmacia/farmacia.module';
import { RestauranteModule }           from './restaurante/restaurante.module';
import { PosContextoModule }          from './pos-contexto/pos-contexto.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    QueuesModule,
    S3Module,
    BrowserModule,     // Global — una única instancia de Chromium para todos los PDFs
    // ── Cache global (Redis en producción, in-memory en dev) ──────────
    CacheModule.registerAsync({
      isGlobal: true,
      imports:  [ConfigModule],
      inject:   [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (redisUrl) {
          const { redisInsStore } = await import('cache-manager-redis-yet');
          return {
            store:  redisInsStore,
            url:    redisUrl,
            ttl:    300_000, // 5 min por defecto en ms
          };
        }
        // Fallback: in-memory cache (dev sin Redis)
        return { ttl: 300_000 };
      },
    }),
    DatabaseModule,
    RealtimeModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const useSSL = config.get<string>('DB_SSL') === 'true';
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          type:     'postgres',
          host:     config.get<string>('DB_HOST',     'localhost'),
          port:     config.get<number>('DB_PORT',     5432),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', ''),
          database: config.get<string>('DB_NAME',     'hicloud'),
          ssl: useSSL ? (() => {
            const certVal = process.env.DB_CA_CERT;
            if (!certVal) {
              // Sin cert: cifrado sin verificación (aceptable en desarrollo)
              return { rejectUnauthorized: false };
            }
            // S-25: soporta ruta de archivo (/path/to/cert.pem) o contenido base64
            const { existsSync, readFileSync } = require('fs');
            const caContent = existsSync(certVal)
              ? readFileSync(certVal, 'utf-8')
              : Buffer.from(certVal, 'base64').toString('utf-8');
            return { rejectUnauthorized: true, ca: caContent };
          })() : false,
          autoLoadEntities: true,
          synchronize: false,
          // ── Connection Pool ────────────────────────────────────────────
          // RDS t3.small: max_connections=79 → reservar 15 para el pool
          // y dejar ~64 libres para otras conexiones (psql, admin, etc.)
          extra: {
            max:                    isProd ? 15 : 5,  // máx conexiones en el pool
            min:                    isProd ? 3  : 1,  // mín conexiones siempre listas
            idleTimeoutMillis:      30_000,            // cerrar idle después de 30s
            connectionTimeoutMillis: 3_000,            // error si no hay conexión en 3s
            statement_timeout:      30_000,            // cancelar queries > 30s
          },
        };
      },
    }),
    TenantModule,
    UsersModule,
    AuthModule,
    ClientesModule,
    ProductosModule,
    FacturasModule,
    ProveedoresModule,
    ComprasModule,
    InventarioModule,
    ECFModule,
    ReportesModule,
    CxCModule,
    CxPModule,
    ContabilidadModule,
    NominaModule,
    TesoreriaModule,
    ActivosFijosModule,
    AuditoriaModule,
    ConfiguracionModule,
    PresupuestosModule,
    NotificacionesModule,
    MultiEmpresaModule,
    CotizacionesModule,
    DevolucionesModule,
    ImportacionModule,
    DemoModule,
    SuscripcionesModule,
    FacturasRecurrentesModule,
    RetencionesModule,
    PortalModule,
    PreciosModule,
    CajaModule,
    ComisionesModule,
    ServiciosModule,
    GastosModule,
    ContratosModule,
    VacacionesModule,
    CRMModule,
    ProyectosModule,
    InvitacionesModule,
    DeclaracionesModule,
    BancosModule,
    TSSModule,
    CentroCostosModule,
    ChequesModule,
    ManufacturaModule,
    AlmacenesModule,
    CalendarioModule,
    FlujoCajaModule,
    MantenimientoModule,
    EvaluacionesModule,
    KpiModule,
    LicitacionesModule,
    FlotaModule,
    ObjetivosModule,
    DatafonoModule,
    EncuestasModule,
    CapacitacionModule,
    PeriodoContableModule,
    ReportesFinancierosModule,
    DocumentosModule,
    SucursalesModule,
    RncModule,
    HealthModule,
    PreFacturaModule,
    ConduceModule,
    CajaChicaModule,
    VendedoresModule,
    EtiquetasModule,
    ComunicacionesModule,
    AnalyticsModule,
    DescuentosModule,
    NotasCreditoModule,
    NotasDebitoModule,
    GruposModule,
    DivisasModule,
    ConteoInventarioModule,
    ValoracionStockModule,
    BusquedaModule,
    DepositosModule,
    IsrModule,
    CreditoClienteModule,
    GeneradorReportesModule,
    ContactosModule,
    AprobacionesModule,
    AlertasSistemaModule,
    FidelidadModule,
    CuotasModule,
    RecibosCobrosModule,
    AnticiposClienteModule,
    NotasCreditoComprasModule,
    LibroVentasModule,
    PortalEmpleadoModule,
    AsistenteModule,
    SuperAdminModule,
    SolicitudesCompraModule,
    PlaneacionDemandaModule,
    CuentasEstadisticasModule,
    WmsModule,
    AtributosProductoModule,
    DistribucionCostosModule,
    UomModule,
    PagosSuscripcionModule,
    ModulosAddonModule,
    OpticaModule,
    TallerModule,
    ClinicaModule,
    FarmaciaModule,
    RestauranteModule,
    PosContextoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD,       useClass: CustomThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // El TenantMiddleware corre en todos los endpoints autenticados
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
