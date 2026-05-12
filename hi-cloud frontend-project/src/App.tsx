import { lazy, Suspense, useEffect } from 'react';
import { ConfigProvider, App as AntApp, theme as antTheme } from 'antd';
import esES from 'antd/locale/es_ES';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

import { useAuthStore, registerLogoutCallback }  from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import AppLayout         from './components/layout/AppLayout';
import ErrorBoundary     from './components/ui/ErrorBoundary';
import PageLoader        from './components/ui/PageLoader';
import ScrollToTop          from './components/ui/ScrollToTop';
import NavigationProgress   from './components/ui/NavigationProgress';

// ── Carga diferida (lazy) — mejora el tiempo de carga inicial ────────────────
const LoginPage          = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage      = lazy(() => import('./pages/dashboard/DashboardPage'));
const ClientesPage       = lazy(() => import('./pages/clientes/ClientesPage'));
const ProductosPage      = lazy(() => import('./pages/productos/ProductosPage'));
const FacturasPage       = lazy(() => import('./pages/facturas/FacturasPage'));
const FacturaFormPage    = lazy(() => import('./pages/facturas/FacturaFormPage'));
const FacturaDetailPage  = lazy(() => import('./pages/facturas/FacturaDetailPage'));
const ComprasPage        = lazy(() => import('./pages/compras/ComprasPage'));
const CompraFormPage     = lazy(() => import('./pages/compras/CompraFormPage'));
const CompraDetailPage   = lazy(() => import('./pages/compras/CompraDetailPage'));
const ProveedoresPage    = lazy(() => import('./pages/proveedores/ProveedoresPage'));
const InventarioPage     = lazy(() => import('./pages/inventario/InventarioPage'));
const CxCPage            = lazy(() => import('./pages/cxc/CxCPage'));
const CxPPage            = lazy(() => import('./pages/cxp/CxPPage'));
const ReportesPage       = lazy(() => import('./pages/reportes/ReportesPage'));
const NominaPage         = lazy(() => import('./pages/nomina/NominaPage'));
const ContabilidadPage   = lazy(() => import('./pages/contabilidad/ContabilidadPage'));
const TesoreriaPage      = lazy(() => import('./pages/tesoreria/TesoreriaPage'));
const ActivosFijosPage   = lazy(() => import('./pages/activos-fijos/ActivosFijosPage'));
const PresupuestosPage   = lazy(() => import('./pages/presupuestos/PresupuestosPage'));
const ConfiguracionPage  = lazy(() => import('./pages/configuracion/ConfiguracionPage'));
const ECFPage            = lazy(() => import('./pages/ecf/ECFPage'));
const AuditoriaPage      = lazy(() => import('./pages/auditoria/AuditoriaPage'));
const ProfilePage        = lazy(() => import('./pages/profile/ProfilePage'));
const CotizacionesPage   = lazy(() => import('./pages/cotizaciones/CotizacionesPage'));
const CotizacionFormPage  = lazy(() => import('./pages/cotizaciones/CotizacionFormPage'));
const DevolucionesPage    = lazy(() => import('./pages/devoluciones/DevolucionesPage'));
const ImportacionPage     = lazy(() => import('./pages/importacion/ImportacionPage'));
const POSPage             = lazy(() => import('./pages/pos/POSPage'));
const EstadoCuentaPage    = lazy(() => import('./pages/clientes/EstadoCuentaPage'));
const PricingPage         = lazy(() => import('./pages/pricing/PricingPage'));
const DemoRequestsPage    = lazy(() => import('./pages/admin/DemoRequestsPage'));
const LandingPage         = lazy(() => import('./pages/landing/LandingPage'));
const RegisterPage        = lazy(() => import('./pages/auth/RegisterPage'));
// SuperAdminPage definida más abajo
const ForgotPasswordPage        = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage         = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerificarCorreoPage       = lazy(() => import('./pages/auth/VerificarCorreoPage'));
const FacturasRecurrentesPage   = lazy(() => import('./pages/facturas/FacturasRecurrentesPage'));
const RetencionesPage           = lazy(() => import('./pages/retenciones/RetencionesPage'));
const ClientPortalPage          = lazy(() => import('./pages/portal/ClientPortalPage'));
const LibroMayorPage            = lazy(() => import('./pages/contabilidad/LibroMayorPage'));
const CajaPage                  = lazy(() => import('./pages/caja/CajaPage'));
const ComisionesPage            = lazy(() => import('./pages/comisiones/ComisionesPage'));
const PreciosEspecialesPage     = lazy(() => import('./pages/precios/PreciosEspecialesPage'));
const ServiciosPage             = lazy(() => import('./pages/servicios/ServiciosPage'));
const GastosPage                = lazy(() => import('./pages/gastos/GastosPage'));
const ContratosPage             = lazy(() => import('./pages/contratos/ContratosPage'));
const VacacionesPage            = lazy(() => import('./pages/vacaciones/VacacionesPage'));
const CRMPage                   = lazy(() => import('./pages/crm/CRMPage'));
const ProyectosPage             = lazy(() => import('./pages/proyectos/ProyectosPage'));
const EquipoPage                = lazy(() => import('./pages/equipo/EquipoPage'));
const AcceptInvitePage          = lazy(() => import('./pages/invitacion/AcceptInvitePage'));
const DeclaracionesPage         = lazy(() => import('./pages/declaraciones/DeclaracionesPage'));
const BancosPage                = lazy(() => import('./pages/bancos/BancosPage'));
const TSSPage                   = lazy(() => import('./pages/tss/TSSPage'));
const CentroCostosPage          = lazy(() => import('./pages/centro-costos/CentroCostosPage'));
const ChequesPage               = lazy(() => import('./pages/cheques/ChequesPage'));
const ManufacturaPage           = lazy(() => import('./pages/manufactura/ManufacturaPage'));
const AlmacenesPage             = lazy(() => import('./pages/almacenes/AlmacenesPage'));
const CalendarioPage            = lazy(() => import('./pages/calendario/CalendarioPage'));
const FlujoCajaPage             = lazy(() => import('./pages/flujo-caja/FlujoCajaPage'));
const MantenimientoPage         = lazy(() => import('./pages/mantenimiento/MantenimientoPage'));
const EvaluacionesPage          = lazy(() => import('./pages/evaluaciones/EvaluacionesPage'));
const KpiPage                   = lazy(() => import('./pages/kpi/KpiPage'));
const LicitacionesPage          = lazy(() => import('./pages/licitaciones/LicitacionesPage'));
const FlotaPage                 = lazy(() => import('./pages/flota/FlotaPage'));
const ObjetivosPage             = lazy(() => import('./pages/objetivos/ObjetivosPage'));
const DatafonoPage              = lazy(() => import('./pages/datafono/DatafonoPage'));
const EncuestasPage             = lazy(() => import('./pages/encuestas/EncuestasPage'));
const CapacitacionPage          = lazy(() => import('./pages/capacitacion/CapacitacionPage'));
const EmpresasPage              = lazy(() => import('./pages/empresas/EmpresasPage'));
const PlanesPage                = lazy(() => import('./pages/suscripcion/PlanesPage'));
const PeriodoContablePage         = lazy(() => import('./pages/periodo-contable/PeriodoContablePage'));
const ReportesFinancierosPage     = lazy(() => import('./pages/reportes-financieros/ReportesFinancierosPage'));
const DocumentosPage              = lazy(() => import('./pages/documentos/DocumentosPage'));
const SucursalesPage              = lazy(() => import('./pages/sucursales/SucursalesPage'));
const PreFacturaPage              = lazy(() => import('./pages/pre-factura/PreFacturaPage'));
const ConducePage                 = lazy(() => import('./pages/conduce/ConducePage'));
const CajaChicaPage               = lazy(() => import('./pages/caja-chica/CajaChicaPage'));
const VendedoresPage              = lazy(() => import('./pages/vendedores/VendedoresPage'));
const EtiquetasPage               = lazy(() => import('./pages/etiquetas/EtiquetasPage'));
const AnalyticsPage               = lazy(() => import('./pages/analytics/AnalyticsPage'));
const ComunicacionesPage          = lazy(() => import('./pages/comunicaciones/ComunicacionesPage'));
const DescuentosPage              = lazy(() => import('./pages/descuentos/DescuentosPage'));
const NotasDebitoPage             = lazy(() => import('./pages/notas-debito/NotasDebitoPage'));
const GruposPage                  = lazy(() => import('./pages/grupos/GruposPage'));
const DivisasPage                 = lazy(() => import('./pages/divisas/DivisasPage'));
const ConteoInventarioPage        = lazy(() => import('./pages/conteo-inventario/ConteoInventarioPage'));
const ValoracionStockPage         = lazy(() => import('./pages/valoracion-stock/ValoracionStockPage'));
const DepositosPage               = lazy(() => import('./pages/depositos/DepositosPage'));
const IsrPage                     = lazy(() => import('./pages/isr/IsrPage'));
const CreditoClientePage          = lazy(() => import('./pages/credito-cliente/CreditoClientePage'));
const GeneradorReportesPage       = lazy(() => import('./pages/generador-reportes/GeneradorReportesPage'));
const ContactosPage               = lazy(() => import('./pages/contactos/ContactosPage'));
const AprobacionesPage            = lazy(() => import('./pages/aprobaciones/AprobacionesPage'));
const FidelidadPage               = lazy(() => import('./pages/fidelidad/FidelidadPage'));
const CuotasPage                  = lazy(() => import('./pages/cuotas/CuotasPage'));
const RecibosCobrosPage           = lazy(() => import('./pages/recibos-cobro/RecibosCobrosPage'));
const BalanceComprobacionPage     = lazy(() => import('./pages/balance-comprobacion/BalanceComprobacionPage'));
const NotasCreditoComprasPage     = lazy(() => import('./pages/notas-credito-compras/NotasCreditoComprasPage'));
const LibroVentasPage             = lazy(() => import('./pages/libro-ventas/LibroVentasPage'));
const PortalEmpleadoPage          = lazy(() => import('./pages/portal-empleado/PortalEmpleadoPage'));
const NotasCreditoPage            = lazy(() => import('./pages/notas-credito/NotasCreditoPage'));
const AsistentePage               = lazy(() => import('./pages/asistente/AsistentePage'));
const SuperAdminPage              = lazy(() => import('./pages/super-admin/SuperAdminPage'));
const BackupsPage                 = lazy(() => import('./pages/super-admin/BackupsPage'));
const SolicitudesCompraPage       = lazy(() => import('./pages/solicitudes-compra/SolicitudesCompraPage'));
const PlaneacionDemandaPage       = lazy(() => import('./pages/planeacion-demanda/PlaneacionDemandaPage'));
const CuentasEstadisticasPage     = lazy(() => import('./pages/cuentas-estadisticas/CuentasEstadisticasPage'));
const WmsPage                     = lazy(() => import('./pages/wms/WmsPage'));
const DistribucionCostosPage      = lazy(() => import('./pages/distribucion-costos/DistribucionCostosPage'));
const UomPage                     = lazy(() => import('./pages/uom/UomPage'));
dayjs.locale('es');

export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            30 * 1000,       // 30s frescos — navegación rápida sin refetch innecesario
      gcTime:               10 * 60 * 1000,  // 10 min en caché
      refetchOnWindowFocus: false,            // no refetch al cambiar de pestaña
      refetchOnMount:       true,             // refetch si datos están stale al montar
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

// Ruta raíz: landing para visitantes, dashboard para usuarios autenticados
// El super_admin siempre va a su panel exclusivo
function PublicHome() {
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  if (!isAuth) return <LandingPage />;
  return <Navigate to={user?.role === 'super_admin' ? '/super-admin' : '/dashboard'} replace />;
}

// Rutas del ERP normal — BLOQUEADAS para super_admin
// Si un super_admin intenta acceder a /dashboard, /facturas, etc. → lo manda a /super-admin
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  if (!isAuth) return <Navigate to="/login" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  return <>{children}</>;
}

/** Evita que un usuario autenticado vea páginas públicas (login, registro). */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  if (!isAuth) return <>{children}</>;
  return <Navigate to={user?.role === 'super_admin' ? '/super-admin' : '/dashboard'} replace />;
}

// Panel exclusivo del Super Admin — solo accesible con role === 'super_admin'
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const user   = useAuthStore((s) => s.user);
  const isAuth = useAuthStore((s) => s.isAuth());
  if (!isAuth) return <Navigate to="/login" replace />;
  if (user?.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isDark } = useThemeStore();

  // Registra la limpieza de React Query cache al hacer logout.
  // Se ejecuta una sola vez al montar la app.
  useEffect(() => {
    registerLogoutCallback(() => qc.clear());
  }, []);

  // Sincroniza el atributo data-theme para que el CSS global pueda reaccionar
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <ConfigProvider
      locale={esES}
      theme={{
        cssVar:    true,
        hashed:    false,
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1a56db',
          borderRadius: 8,
          fontFamily:   'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          ...(isDark && {
            colorBgBase:      '#0d1117',
            colorBgContainer: '#161b22',
            colorBgLayout:    '#0d1117',
            colorBgElevated:  '#1c2128',
          }),
        },
        components: {
          Card:   { borderRadius: 12 },
          Table:  { borderRadius: 10 },
          Modal:  { borderRadius: 12 },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <ScrollToTop />
            <NavigationProgress />
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* ── Super Admin — layout propio sin sidebar de empresa ── */}
                  <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />
                  <Route path="/super-admin/backups" element={<SuperAdminRoute><BackupsPage /></SuperAdminRoute>} />

                  {/* ── Rutas públicas — redirigen al dashboard si ya está autenticado ── */}
                  <Route path="/"                        element={<PublicHome />} />
                  <Route path="/login"                   element={<GuestRoute><LoginPage /></GuestRoute>} />
                  <Route path="/registrar"               element={<GuestRoute><RegisterPage /></GuestRoute>} />
                  <Route path="/precios"                 element={<PricingPage />} />
                  <Route path="/recuperar-contrasena"    element={<ForgotPasswordPage />} />
                  <Route path="/restablecer/:token"      element={<ResetPasswordPage />} />
                  <Route path="/verificar-correo"        element={<VerificarCorreoPage />} />
                  {/* Portal del cliente — PÚBLICO */}
                  <Route path="/portal/:token"           element={<ClientPortalPage />} />
                  {/* Aceptar invitación — PÚBLICO */}
                  <Route path="/invitacion/:token"       element={<AcceptInvitePage />} />

                  {/* ── App protegida — rutas absolutas bajo AppLayout ── */}
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

                    {/* ── Core ── */}
                    <Route path="/dashboard"                    element={<DashboardPage />} />
                    <Route path="/pos"                          element={<POSPage />} />
                    <Route path="/clientes"                     element={<ClientesPage />} />
                    <Route path="/clientes/:id/estado-cuenta"   element={<EstadoCuentaPage />} />
                    <Route path="/productos"                    element={<ProductosPage />} />

                    {/* ── Ventas ── */}
                    <Route path="/cotizaciones"       element={<CotizacionesPage />} />
                    <Route path="/cotizaciones/nueva" element={<CotizacionFormPage />} />
                    <Route path="/facturas"                    element={<FacturasPage />} />
                    <Route path="/facturas/nueva"            element={<FacturaFormPage />} />
                    <Route path="/facturas/:id"              element={<FacturaDetailPage />} />
                    <Route path="/facturas-recurrentes"      element={<FacturasRecurrentesPage />} />
                    <Route path="/devoluciones"              element={<DevolucionesPage />} />

                    {/* ── Compras ── */}
                    <Route path="/compras"            element={<ComprasPage />} />
                    <Route path="/compras/nueva"      element={<CompraFormPage />} />
                    <Route path="/compras/:id"        element={<CompraDetailPage />} />
                    <Route path="/proveedores"        element={<ProveedoresPage />} />
                    <Route path="/solicitudes-compra"  element={<SolicitudesCompraPage />} />
                    <Route path="/planeacion-demanda"      element={<PlaneacionDemandaPage />} />
                    <Route path="/cuentas-estadisticas"   element={<CuentasEstadisticasPage />} />
                    <Route path="/wms"                    element={<WmsPage />} />
                    <Route path="/distribucion-costos"    element={<DistribucionCostosPage />} />
                    <Route path="/uom"                    element={<UomPage />} />

                    {/* ── Operaciones ── */}
                    <Route path="/inventario"         element={<InventarioPage />} />
                    <Route path="/ecf"                element={<ECFPage />} />

                    {/* ── Finanzas ── */}
                    <Route path="/cxc"                element={<CxCPage />} />
                    <Route path="/cxp"                element={<CxPPage />} />
                    <Route path="/tesoreria"          element={<TesoreriaPage />} />
                    <Route path="/contabilidad"       element={<ContabilidadPage />} />

                    {/* ── RRHH ── */}
                    <Route path="/nomina"             element={<NominaPage />} />
                    <Route path="/activos-fijos"      element={<ActivosFijosPage />} />

                    {/* ── Análisis ── */}
                    <Route path="/reportes"           element={<ReportesPage />} />
                    <Route path="/presupuestos"       element={<PresupuestosPage />} />
                    <Route path="/retenciones"        element={<RetencionesPage />} />
                    <Route path="/libro-mayor"        element={<LibroMayorPage />} />
                    <Route path="/caja"               element={<CajaPage />} />
                    <Route path="/comisiones"         element={<ComisionesPage />} />
                    <Route path="/precios-especiales" element={<PreciosEspecialesPage />} />
                    <Route path="/servicios"          element={<ServiciosPage />} />
                    <Route path="/gastos"             element={<GastosPage />} />
                    <Route path="/contratos"          element={<ContratosPage />} />
                    <Route path="/vacaciones"         element={<VacacionesPage />} />
                    <Route path="/crm"                element={<CRMPage />} />
                    <Route path="/proyectos"          element={<ProyectosPage />} />
                    <Route path="/equipo"             element={<EquipoPage />} />
                    <Route path="/declaraciones"      element={<DeclaracionesPage />} />
                    <Route path="/bancos"             element={<BancosPage />} />
                    <Route path="/tss"                element={<TSSPage />} />
                    <Route path="/centro-costos"      element={<CentroCostosPage />} />
                    <Route path="/cheques"            element={<ChequesPage />} />
                    <Route path="/manufactura"        element={<ManufacturaPage />} />
                    <Route path="/almacenes"          element={<AlmacenesPage />} />
                    <Route path="/calendario"         element={<CalendarioPage />} />
                    <Route path="/flujo-caja"         element={<FlujoCajaPage />} />
                    <Route path="/mantenimiento"       element={<MantenimientoPage />} />
                    <Route path="/evaluaciones"        element={<EvaluacionesPage />} />
                    <Route path="/kpi"                 element={<KpiPage />} />
                    <Route path="/licitaciones"        element={<LicitacionesPage />} />
                    <Route path="/flota"               element={<FlotaPage />} />
                    <Route path="/objetivos"           element={<ObjetivosPage />} />
                    <Route path="/datafono"            element={<DatafonoPage />} />
                    <Route path="/encuestas"           element={<EncuestasPage />} />
                    <Route path="/capacitacion"        element={<CapacitacionPage />} />
                    <Route path="/mis-empresas"        element={<EmpresasPage />} />
                    <Route path="/suscripcion/planes"  element={<PlanesPage />} />
                    <Route path="/periodo-contable"        element={<PeriodoContablePage />} />
                    <Route path="/reportes-financieros"    element={<ReportesFinancierosPage />} />
                    <Route path="/documentos"              element={<DocumentosPage />} />
                    <Route path="/sucursales"              element={<SucursalesPage />} />
                    <Route path="/pre-facturas"            element={<PreFacturaPage />} />
                    <Route path="/conduces"               element={<ConducePage />} />
                    <Route path="/caja-chica"             element={<CajaChicaPage />} />
                    <Route path="/vendedores"              element={<VendedoresPage />} />
                    <Route path="/etiquetas"               element={<EtiquetasPage />} />
                    <Route path="/analytics"              element={<AnalyticsPage />} />
                    <Route path="/comunicaciones"         element={<ComunicacionesPage />} />
                    <Route path="/descuentos"             element={<DescuentosPage />} />
                    <Route path="/notas-debito"           element={<NotasDebitoPage />} />
                    <Route path="/grupos"                 element={<GruposPage />} />
                    <Route path="/divisas"                element={<DivisasPage />} />
                    <Route path="/conteo-inventario"      element={<ConteoInventarioPage />} />
                    <Route path="/valoracion-stock"       element={<ValoracionStockPage />} />
                    <Route path="/depositos"              element={<DepositosPage />} />
                    <Route path="/isr"                    element={<IsrPage />} />
                    <Route path="/credito-cliente"        element={<CreditoClientePage />} />
                    <Route path="/generador-reportes"     element={<GeneradorReportesPage />} />
                    <Route path="/contactos"              element={<ContactosPage />} />
                    <Route path="/aprobaciones"           element={<AprobacionesPage />} />
                    <Route path="/fidelidad"              element={<FidelidadPage />} />
                    <Route path="/cuotas"                 element={<CuotasPage />} />
                    <Route path="/recibos-cobro"          element={<RecibosCobrosPage />} />
                    <Route path="/balance-comprobacion"   element={<BalanceComprobacionPage />} />
                    <Route path="/notas-credito"          element={<NotasCreditoPage />} />
                    <Route path="/notas-credito-compras"  element={<NotasCreditoComprasPage />} />
                    <Route path="/libro-ventas"           element={<LibroVentasPage />} />
                    <Route path="/portal-empleado"        element={<PortalEmpleadoPage />} />
                    {/* ── Sistema ── */}
                    <Route path="/auditoria"          element={<AuditoriaPage />} />
                    <Route path="/importacion"        element={<ImportacionPage />} />
                    <Route path="/configuracion"      element={<ConfiguracionPage />} />
                    <Route path="/profile"            element={<ProfilePage />} />
                    <Route path="/asistente"          element={<AsistentePage />} />
                    <Route path="/demo-requests"      element={<DemoRequestsPage />} />
                    {/* /super-admin está definida fuera del AppLayout */}
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
