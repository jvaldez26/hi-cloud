import { lazy, Suspense, useEffect } from 'react';
import { ConfigProvider, App as AntApp, theme as antTheme } from 'antd';
import esES from 'antd/locale/es_ES';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

import { useAuthStore, registerLogoutCallback }  from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import AppLayout                from './components/layout/AppLayout';
import PortalEmpleadoLayout     from './components/layout/PortalEmpleadoLayout';
import ErrorBoundary     from './components/ui/ErrorBoundary';
import PageLoader        from './components/ui/PageLoader';
import ScrollToTop          from './components/ui/ScrollToTop';

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
const GoogleCallbackPage        = lazy(() => import('./pages/auth/GoogleCallbackPage'));
const PendingApprovalPage       = lazy(() => import('./pages/auth/PendingApprovalPage'));
const OnboardingEmpresaPage     = lazy(() => import('./pages/auth/OnboardingEmpresaPage'));
const PendingEmpresaPage        = lazy(() => import('./pages/auth/PendingEmpresaPage'));
const SetupPasswordPage         = lazy(() => import('./pages/auth/SetupPasswordPage'));
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
const SinEmpresaPage            = lazy(() => import('./pages/sin-empresa/SinEmpresaPage'));
const PlanesPage                = lazy(() => import('./pages/suscripcion/PlanesPage'));
const PeriodoContablePage         = lazy(() => import('./pages/periodo-contable/PeriodoContablePage'));
const ReportesFinancierosPage     = lazy(() => import('./pages/reportes-financieros/ReportesFinancierosPage'));
const DocumentosPage              = lazy(() => import('./pages/documentos/DocumentosPage'));
const SucursalesPage              = lazy(() => import('./pages/sucursales/SucursalesPage'));
const PreFacturaPage              = lazy(() => import('./pages/pre-factura/PreFacturaPage'));
const ProFormasPage               = lazy(() => import('./pages/pro-formas/ProFormasPage'));
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
const AnticiposClientePage        = lazy(() => import('./pages/anticipos-cliente/AnticiposClientePage'));
const GeneradorReportesPage       = lazy(() => import('./pages/generador-reportes/GeneradorReportesPage'));
const ContactosPage               = lazy(() => import('./pages/contactos/ContactosPage'));
const AprobacionesPage            = lazy(() => import('./pages/aprobaciones/AprobacionesPage'));
const FidelidadPage               = lazy(() => import('./pages/fidelidad/FidelidadPage'));
const TicketsSoportePage          = lazy(() => import('./pages/soporte/TicketsSoportePage'));
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
const MiSuscripcionPage           = lazy(() => import('./pages/suscripcion/MiSuscripcionPage'));
const OpticaLayout                = lazy(() => import('./pages/optica/OpticaLayout'));
const OpticaDashboardPage         = lazy(() => import('./pages/optica/OpticaDashboardPage'));
const PacientesOpticaPage         = lazy(() => import('./pages/optica/PacientesOpticaPage'));
const MedicosOpticaPage           = lazy(() => import('./pages/optica/MedicosOpticaPage'));
const AgendaOpticaPage            = lazy(() => import('./pages/optica/AgendaOpticaPage'));
const ConsultasOpticaPage         = lazy(() => import('./pages/optica/ConsultasOpticaPage'));
const RecetasOpticaPage           = lazy(() => import('./pages/optica/RecetasOpticaPage'));
const OrdenesTrabajoOpticaPage    = lazy(() => import('./pages/optica/OrdenesTrabajoOpticaPage'));
const ReclamacionesArsPage        = lazy(() => import('./pages/optica/ReclamacionesArsPage'));
const FichaPacientePage           = lazy(() => import('./pages/optica/FichaPacientePage'));
const InventarioOpticaPage        = lazy(() => import('./pages/optica/InventarioOpticaPage'));
const TallerLayout                = lazy(() => import('./pages/taller/TallerLayout'));
const TallerDashboardPage         = lazy(() => import('./pages/taller/TallerDashboardPage'));
const VehiculosPage               = lazy(() => import('./pages/taller/VehiculosPage'));
const VehiculoDetallePage         = lazy(() => import('./pages/taller/VehiculoDetallePage'));
const OrdenesPage                 = lazy(() => import('./pages/taller/OrdenesPage'));
const OrdenDetallePage            = lazy(() => import('./pages/taller/OrdenDetallePage'));
const TecnicosPage                = lazy(() => import('./pages/taller/TecnicosPage'));
const AgendaTallerPage            = lazy(() => import('./pages/taller/AgendaTallerPage'));
const CatalogoPage                = lazy(() => import('./pages/taller/CatalogoPage'));
const TallerReportesPage          = lazy(() => import('./pages/taller/ReportesPage'));
const ClinicaLayout               = lazy(() => import('./pages/clinica/ClinicaLayout'));
const ClinicaDashboard            = lazy(() => import('./pages/clinica/DashboardPage'));
const ClinicaPacientesPage        = lazy(() => import('./pages/clinica/PacientesPage'));
const ClinicaPacienteDetalle      = lazy(() => import('./pages/clinica/PacienteDetallePage'));
const ClinicaAgendaPage           = lazy(() => import('./pages/clinica/AgendaPage'));
const ClinicaSalaEsperaPage       = lazy(() => import('./pages/clinica/SalaEsperaPage'));
const ClinicaConsultaPage         = lazy(() => import('./pages/clinica/ConsultaPage'));
const ClinicaRecetasPage          = lazy(() => import('./pages/clinica/RecetasPage'));
const ClinicaLaboratorioPage      = lazy(() => import('./pages/clinica/LaboratorioPage'));
const ClinicaProcedimientosPage   = lazy(() => import('./pages/clinica/ProcedimientosPage'));
const ClinicaArsPage              = lazy(() => import('./pages/clinica/ArsPage'));
const ClinicaMedicosPage          = lazy(() => import('./pages/clinica/MedicosPage'));
const ClinicaCatalogoPage         = lazy(() => import('./pages/clinica/CatalogoPage'));
const ClinicaReportesPage         = lazy(() => import('./pages/clinica/ReportesPage'));
const FarmaciaLayout              = lazy(() => import('./pages/farmacia/FarmaciaLayout'));
const FarmaciaDashboard           = lazy(() => import('./pages/farmacia/FarmaciaDashboard'));
const FarmaciaDispensacionPage    = lazy(() => import('./pages/farmacia/DispensacionPage'));
const FarmaciaMedicamentosPage    = lazy(() => import('./pages/farmacia/MedicamentosPage'));
const FarmaciaLotesPage           = lazy(() => import('./pages/farmacia/LotesPage'));
const FarmaciaRecepcionesPage     = lazy(() => import('./pages/farmacia/RecepcionesPage'));
const FarmaciaNarcoticoPage       = lazy(() => import('./pages/farmacia/NarcoticoPage'));
const FarmaciaDevolucionesPage    = lazy(() => import('./pages/farmacia/DevolucionesPage'));
const FarmaciaArsPage             = lazy(() => import('./pages/farmacia/ArsPage'));
const FarmaciaReportesPage        = lazy(() => import('./pages/farmacia/ReportesPage'));
const RestauranteDashboard        = lazy(() => import('./pages/restaurante/RestauranteDashboard'));
const MapaMesasPage               = lazy(() => import('./pages/restaurante/MapaMesasPage'));
const ComandaPage                 = lazy(() => import('./pages/restaurante/ComandaPage'));
const KDSPage                     = lazy(() => import('./pages/restaurante/KDSPage'));
const DeliveryPage                = lazy(() => import('./pages/restaurante/DeliveryPage'));
const ReservacionesPage           = lazy(() => import('./pages/restaurante/ReservacionesPage'));
const MenuRsPage                  = lazy(() => import('./pages/restaurante/MenuPage'));
const TurnosPage                  = lazy(() => import('./pages/restaurante/TurnosPage'));
const ReportesRsPage              = lazy(() => import('./pages/restaurante/ReportesPage'));
const GimnasioLayout              = lazy(() => import('./pages/gimnasio/GimnasioLayout'));
const GimnasioDashboard           = lazy(() => import('./pages/gimnasio/GimnasioDashboard'));
const ControlAccesoPage           = lazy(() => import('./pages/gimnasio/ControlAccesoPage'));
const MiembrosGimnasioPage        = lazy(() => import('./pages/gimnasio/MiembrosPage'));
const FichaMiembroPage            = lazy(() => import('./pages/gimnasio/FichaMiembroPage'));
const MembresiasPage              = lazy(() => import('./pages/gimnasio/MembresiasPage'));
const ClasesGimnasioPage          = lazy(() => import('./pages/gimnasio/ClasesPage'));
const EntrenadoresPage            = lazy(() => import('./pages/gimnasio/EntrenadoresPage'));
const RutinasPage                 = lazy(() => import('./pages/gimnasio/RutinasPage'));
const ProgresoPage                = lazy(() => import('./pages/gimnasio/ProgresoPage'));
const AccesosGimnasioPage         = lazy(() => import('./pages/gimnasio/AccesosPage'));
const LockersPage                 = lazy(() => import('./pages/gimnasio/LockersPage'));
const NutricionPage               = lazy(() => import('./pages/gimnasio/NutricionPage'));
const TiendaGimnasioPage          = lazy(() => import('./pages/gimnasio/TiendaPage'));
const GimnasioReportesPage        = lazy(() => import('./pages/gimnasio/GimnasioReportesPage'));
// Servicios Profesionales
const ServiciosProLayout          = lazy(() => import('./pages/servicios-pro/ServiciosProLayout'));
const ServiciosProDashboard       = lazy(() => import('./pages/servicios-pro/ServiciosProDashboard'));
const ExpedientesPage             = lazy(() => import('./pages/servicios-pro/ExpedientesPage'));
const ExpedienteDetallePage       = lazy(() => import('./pages/servicios-pro/ExpedienteDetallePage'));
const TimeTrackerPage             = lazy(() => import('./pages/servicios-pro/TimeTrackerPage'));
const SpTareasPage                = lazy(() => import('./pages/servicios-pro/TareasPage'));
const ReunionesPage               = lazy(() => import('./pages/servicios-pro/ReunionesPage'));
const SpContratosPage             = lazy(() => import('./pages/servicios-pro/ContratosPage'));
const HonorariosPage              = lazy(() => import('./pages/servicios-pro/HonorariosPage'));
const RetainersPage               = lazy(() => import('./pages/servicios-pro/RetainersPage'));
const SpProfesionalesPage         = lazy(() => import('./pages/servicios-pro/ProfesionalesPage'));
const SpReportesPage              = lazy(() => import('./pages/servicios-pro/ReportesPage'));
// Prestamista / Financiera
const PrestamistalLayout          = lazy(() => import('./pages/prestamista/PrestamistalLayout'));
const DashboardPrestamistaPage    = lazy(() => import('./pages/prestamista/DashboardPrestamistaPage'));
const DeudoresPage                = lazy(() => import('./pages/prestamista/DeudoresPage'));
const FichaDeudorPage             = lazy(() => import('./pages/prestamista/FichaDeudorPage'));
const ProductosPrestamoPage       = lazy(() => import('./pages/prestamista/ProductosPrestamoPage'));
const SolicitudesPage             = lazy(() => import('./pages/prestamista/SolicitudesPage'));
const PrestamosPage               = lazy(() => import('./pages/prestamista/PrestamosPage'));
const DetallePrestamo             = lazy(() => import('./pages/prestamista/DetallePrestamo'));
const SimuladorPage               = lazy(() => import('./pages/prestamista/SimuladorPage'));
const CobranzaPage                = lazy(() => import('./pages/prestamista/CobranzaPage'));
const ReportesPrestamistaPage     = lazy(() => import('./pages/prestamista/ReportesPrestamistaPage'));
// Agro / Finca
const AgroDashboard               = lazy(() => import('./pages/agro/AgroDashboard'));
const FincasPage                  = lazy(() => import('./pages/agro/FincasPage'));
const ParcelasPage                = lazy(() => import('./pages/agro/ParcelasPage'));
const CiclosPage                  = lazy(() => import('./pages/agro/CiclosPage'));
const CicloDetallePage            = lazy(() => import('./pages/agro/CicloDetallePage'));
const CosechasPage                = lazy(() => import('./pages/agro/CosechasPage'));
const GanaderiaPage               = lazy(() => import('./pages/agro/GanaderiaPage'));
const AnimalDetallePage           = lazy(() => import('./pages/agro/AnimalDetallePage'));
const InsumosPage                 = lazy(() => import('./pages/agro/InsumosPage'));
const MaquinariaPage              = lazy(() => import('./pages/agro/MaquinariaPage'));
const AgroReportesPage            = lazy(() => import('./pages/agro/ReportesPage'));
// Transporte
const TransporteLayout            = lazy(() => import('./pages/transporte/TransporteLayout'));
const TransporteDashboardPage     = lazy(() => import('./pages/transporte/TransporteDashboardPage'));
const VehiculosTransportePage     = lazy(() => import('./pages/transporte/VehiculosTransportePage'));
const ChoferesTransportePage      = lazy(() => import('./pages/transporte/ChoferesTransportePage'));
const ViajesPage                  = lazy(() => import('./pages/transporte/ViajesPage'));
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

/** Calcula la ruta home de un usuario autenticado según su rol */
function homeForRole(role?: string): string {
  if (role === 'super_admin') return '/super-admin';
  if (role === 'empleado')    return '/portal-empleado';
  return '/dashboard';
}

/** Pantalla de carga durante hidratación — mismos dots que index.html para
 *  transición imperceptible del loader HTML al loader React. */
function AppLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--hc-bg-page, #ffffff)',
    }}>
      <style>{`
        @keyframes hc-b{0%,80%,100%{transform:scale(.7);opacity:.5}40%{transform:scale(1.2);opacity:1}}
        .hc-d{width:10px;height:10px;border-radius:50%;animation:hc-b 1.2s ease-in-out infinite}
      `}</style>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="hc-d" style={{ background: '#93c5fd', animationDelay: '0s' }} />
        <div className="hc-d" style={{ background: '#60a5fa', animationDelay: '.2s' }} />
        <div className="hc-d" style={{ background: '#3b82f6', animationDelay: '.4s' }} />
      </div>
    </div>
  );
}

// Ruta raíz: landing para visitantes, dashboard para autenticados.
function PublicHome() {
  const { hydrated }  = useAuthStore();
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);

  // Mientras se verifica la sesión → spinner, no pantalla en blanco
  if (!hydrated) return <AppLoader />;

  if (isAuth) {
    return <Navigate to={homeForRole(user?.role)} replace />;
  }
  return <LandingPage />;
}

// Rutas del ERP normal — BLOQUEADAS para super_admin y empleado
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { hydrated } = useAuthStore();
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  // Esperar hydratación antes de redirigir — evita flash de /login durante carga inicial
  if (!hydrated) return <AppLoader />;
  if (!isAuth) return <Navigate to="/login" replace />;
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  if (user?.role === 'empleado')    return <Navigate to="/portal-empleado" replace />;
  return <>{children}</>;
}

/** Evita que un usuario autenticado vea páginas públicas (login, registro). */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { hydrated } = useAuthStore();
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  // Esperar hydratación antes de decidir — evita mostrar login cuando el usuario está autenticado
  if (!hydrated) return <AppLoader />;
  if (!isAuth) return <>{children}</>;
  return <Navigate to={homeForRole(user?.role)} replace />;
}

// Panel exclusivo del Super Admin — solo accesible con role === 'super_admin'
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { hydrated } = useAuthStore();
  const user   = useAuthStore((s) => s.user);
  const isAuth = useAuthStore((s) => s.isAuth());
  if (!hydrated) return <AppLoader />;
  if (!isAuth) return <Navigate to="/login" replace />;
  if (user?.role !== 'super_admin') return <Navigate to={homeForRole(user?.role)} replace />;
  return <>{children}</>;
}

// Portal exclusivo del Empleado — solo role === 'empleado' (o admin/contador para pruebas)
function EmpleadoRoute({ children }: { children: React.ReactNode }) {
  const { hydrated } = useAuthStore();
  const isAuth = useAuthStore((s) => s.isAuth());
  const user   = useAuthStore((s) => s.user);
  if (!hydrated) return <AppLoader />;
  if (!isAuth) return <Navigate to="/login" replace />;
  // Admin y contador pueden ver el portal desde el ERP — no bloqueamos
  if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isDark } = useThemeStore();
  const { login, logout, hydrated, setHydrated } = useAuthStore();

  // Registra la limpieza de React Query cache al hacer logout.
  useEffect(() => {
    registerLogoutCallback(() => qc.clear());
  }, []);

  // S-23: Hidratar sesión al cargar — verificar cookie httpOnly via GET /auth/me
  // Si hay cookie válida → restaurar estado. Si no → limpiar.
  useEffect(() => {
    if (hydrated) return;

    // Si el usuario hizo logout (no hay auth_user en localStorage) y está en una
    // página pública, no intentar rehidratar — evita que la cookie httpOnly restaure
    // la sesión silenciosamente después de un logout explícito.
    const savedUser = localStorage.getItem('auth_user');
    const publicPaths = ['/login', '/registrar', '/recuperar-contrasena',
                         '/restablecer', '/verificar-correo', '/portal/',
                         '/invitacion/', '/precios', '/auth/callback',
                         '/pending-approval', '/setup-password',
                         '/onboarding/empresa', '/pending-empresa'];
    const onPublicPage = window.location.pathname === '/' ||
                         publicPaths.some(p => window.location.pathname.startsWith(p));
    if (!savedUser && onPublicPage) {
      setHydrated(true);
      return;
    }

    import('./api/client').then(({ default: api }) => {
      api.get('/auth/me')
        .then((r) => {
          const user = r.data?.data?.user ?? r.data?.user ?? r.data;
          const empresaId      = localStorage.getItem('empresaId');
          const empresasRaw    = localStorage.getItem('mis_empresas');
          const empresas       = empresasRaw ? JSON.parse(empresasRaw) : [];
          const sucursalId     = localStorage.getItem('sucursalId');
          const sucursalNombre = localStorage.getItem('sucursalNombre');
          login(user, empresaId ? Number(empresaId) : null, empresas,
                null, sucursalId ? Number(sucursalId) : null, sucursalNombre);
        })
        .catch(() => {
          // Cookie inválida o expirada — limpiar estado
          logout();
        })
        .finally(() => setHydrated(true));
    });
  }, [hydrated, login, logout, setHydrated]);

  // Sincroniza data-theme en html+body y clase dark en html
  // Los popups de Ant Design (Select, Dropdown) son portales en body
  // → ponemos data-theme en ambos para que todos los selectores CSS funcionen
  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <ConfigProvider
      locale={esES}
      theme={{
        cssVar:    true,
        hashed:    false,
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          /* ── Tipografía (igual en ambos modos) ── */
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize:   14,
          lineHeight: 1.5,

          /* ── Marca (igual en ambos modos) ── */
          colorPrimary: '#0EA5E9',
          colorSuccess: '#10B981',
          colorWarning: '#F59E0B',
          colorError:   '#EF4444',
          colorInfo:    '#0EA5E9',

          /* ── Geometría (igual en ambos modos) ── */
          borderRadius:   8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,

          /* ── Spacing (igual en ambos modos) ── */
          padding:   16,
          paddingLG: 24,
          paddingSM: 12,
          paddingXS: 8,

          /* ── Colores de texto — condicionales para no sobreescribir darkAlgorithm ── */
          ...(isDark ? {
            colorText:          '#E6EDF3',
            colorTextSecondary: '#8B949E',
            colorTextTertiary:  '#6E7681',
            colorTextDisabled:  '#484F58',
            colorBorder:        '#30363D',
            colorBorderSecondary: '#21262D',
            colorBgBase:        '#0D1117',
            colorBgContainer:   '#161B22',
            colorBgLayout:      '#0D1117',
            colorBgElevated:    '#1C2128',
          } : {
            colorText:          '#0F172A',
            colorTextSecondary: '#475569',
            colorTextTertiary:  '#94A3B8',
            colorTextDisabled:  '#CBD5E1',
            colorBorder:        '#E2E8F0',
            colorBorderSecondary: '#F1F5F9',
            colorBgBase:        '#FFFFFF',
            colorBgContainer:   '#FFFFFF',
            colorBgLayout:      '#F8FAFC',
            colorBgElevated:    '#FFFFFF',
            colorBgSpotlight:   '#F1F5F9',
          }),
        },
        components: {
          Table: {
            borderRadius:      0,
            headerBg:          isDark ? '#1C2128' : '#F8FAFC',
            headerColor:       isDark ? '#6E7681' : '#94A3B8',
            rowHoverBg:        isDark ? '#1C2128' : '#F8FAFC',
            borderColor:       isDark ? '#30363D' : '#E2E8F0',
            cellPaddingBlock:  11,
            cellPaddingInline: 14,
          },
          Card: {
            borderRadius: 12,
            paddingLG:    24,
            boxShadow:    isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
          },
          Button: {
            borderRadius:  8,
            fontWeight:    500,
            paddingInline: 16,
          },
          Input: {
            borderRadius:  8,
            paddingBlock:  8,
            paddingInline: 12,
            colorBgContainer: isDark ? '#1C2128' : '#FFFFFF',
          },
          Select: {
            borderRadius:     8,
            colorBgContainer: isDark ? '#1C2128' : '#FFFFFF',
            colorBgElevated:  isDark ? '#161B22' : '#FFFFFF',
          },
          DatePicker: {
            borderRadius:     8,
            colorBgContainer: isDark ? '#1C2128' : '#FFFFFF',
            colorBgElevated:  isDark ? '#161B22' : '#FFFFFF',
          },
          InputNumber: {
            borderRadius:     8,
            colorBgContainer: isDark ? '#1C2128' : '#FFFFFF',
          },
          Modal: {
            borderRadius:  16,
            contentBg:     isDark ? '#1C2128' : '#FFFFFF',
            headerBg:      isDark ? '#1C2128' : '#FFFFFF',
          },
          Drawer: {
            borderRadius:     0,
            colorBgElevated:  isDark ? '#1C2128' : '#FFFFFF',
          },
          Tag: {
            borderRadius: 20,
            fontSize:     12,
          },
          Statistic: {
            titleFontSize:   13,
            contentFontSize: 26,
          },
          Menu: {
            colorBgContainer: isDark ? '#0D1117' : '#FFFFFF',
          },
          Dropdown: {
            colorBgElevated: isDark ? '#161B22' : '#FFFFFF',
          },
          Tooltip: {
            colorBgSpotlight: isDark ? '#2D333B' : '#1C2128',
          },
          Notification: {
            colorBgElevated: isDark ? '#1C2128' : '#FFFFFF',
          },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <ScrollToTop />
            <ErrorBoundary>
              <Suspense fallback={null}>
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
                  <Route path="/auth/callback"           element={<GoogleCallbackPage />} />
                  <Route path="/pending-approval"        element={<PendingApprovalPage />} />
                  <Route path="/onboarding/empresa"      element={<OnboardingEmpresaPage />} />
                  <Route path="/pending-empresa"         element={<PendingEmpresaPage />} />
                  <Route path="/setup-password"          element={<SetupPasswordPage />} />
                  {/* Portal del cliente — PÚBLICO */}
                  <Route path="/portal/:token"           element={<ClientPortalPage />} />
                  {/* Aceptar invitación — PÚBLICO */}
                  <Route path="/invitacion/:token"       element={<AcceptInvitePage />} />

                  {/* ── Portal del Empleado — layout minimalista, solo rol empleado ── */}
                  {/* Empleados usan este layout; admin/contador acceden desde AppLayout */}
                  <Route element={<EmpleadoRoute><PortalEmpleadoLayout /></EmpleadoRoute>}>
                    <Route path="/portal-empleado" element={<PortalEmpleadoPage />} />
                  </Route>

                  {/* ── App protegida — rutas absolutas bajo AppLayout ── */}
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

                    {/* ── Core ── */}
                    <Route path="/dashboard"                    element={<DashboardPage />} />
                    <Route path="/pos"                          element={<POSPage />} />
                    <Route path="/clientes"                     element={<ClientesPage />} />
                    <Route path="/clientes/:id/estado-cuenta"   element={<EstadoCuentaPage />} />
                    <Route path="/productos"                    element={<ProductosPage />} />

                    {/* ── Ventas ── */}
                    <Route path="/cotizaciones"              element={<CotizacionesPage />} />
                    <Route path="/cotizaciones/nueva"        element={<CotizacionFormPage />} />
                    <Route path="/cotizaciones/:id/editar"   element={<CotizacionFormPage />} />
                    <Route path="/facturas"                    element={<FacturasPage />} />
                    <Route path="/facturas/nueva"            element={<FacturaFormPage />} />
                    <Route path="/facturas/:id/editar"       element={<FacturaFormPage />} />
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
                    <Route path="/sin-empresa"         element={<SinEmpresaPage />} />
                    <Route path="/suscripcion/planes"  element={<PlanesPage />} />
                    <Route path="/periodo-contable"        element={<PeriodoContablePage />} />
                    <Route path="/reportes-financieros"    element={<ReportesFinancierosPage />} />
                    <Route path="/documentos"              element={<DocumentosPage />} />
                    <Route path="/sucursales"              element={<SucursalesPage />} />
                    <Route path="/pre-facturas"            element={<PreFacturaPage />} />
                    <Route path="/pro-formas"              element={<ProFormasPage />} />
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
                    <Route path="/anticipos-cliente"      element={<AnticiposClientePage />} />
                    <Route path="/generador-reportes"     element={<GeneradorReportesPage />} />
                    <Route path="/contactos"              element={<ContactosPage />} />
                    <Route path="/aprobaciones"           element={<AprobacionesPage />} />
                    <Route path="/fidelidad"              element={<FidelidadPage />} />
                    <Route path="/soporte/tickets"        element={<TicketsSoportePage />} />
                    <Route path="/cuotas"                 element={<CuotasPage />} />
                    <Route path="/recibos-cobro"          element={<RecibosCobrosPage />} />
                    <Route path="/balance-comprobacion"   element={<BalanceComprobacionPage />} />
                    <Route path="/notas-credito"          element={<NotasCreditoPage />} />
                    <Route path="/notas-credito-compras"  element={<NotasCreditoComprasPage />} />
                    <Route path="/libro-ventas"           element={<LibroVentasPage />} />
                    {/* /portal-empleado definida fuera del AppLayout para rol empleado */}
                    {/* Admin/Contador acceden desde el sidebar, que navega a /portal-empleado */}
                    {/* ── Sistema ── */}
                    <Route path="/auditoria"          element={<AuditoriaPage />} />
                    <Route path="/importacion"        element={<ImportacionPage />} />
                    <Route path="/configuracion"      element={<ConfiguracionPage />} />
                    <Route path="/mi-suscripcion"     element={<MiSuscripcionPage />} />
                    <Route path="/profile"            element={<ProfilePage />} />
                    <Route path="/asistente"          element={<AsistentePage />} />
                    <Route path="/demo-requests"      element={<DemoRequestsPage />} />
                    {/* /super-admin está definida fuera del AppLayout */}

                    {/* ── Módulo Óptica (add-on) ── */}
                    <Route path="/optica" element={<OpticaLayout />}>
                      <Route index                  element={<OpticaDashboardPage />} />
                      <Route path="pacientes"        element={<PacientesOpticaPage />} />
                      <Route path="pacientes/:id"    element={<FichaPacientePage />} />
                      <Route path="medicos"          element={<MedicosOpticaPage />} />
                      <Route path="agenda"           element={<AgendaOpticaPage />} />
                      <Route path="consultas"        element={<ConsultasOpticaPage />} />
                      <Route path="recetas"          element={<RecetasOpticaPage />} />
                      <Route path="ordenes"          element={<OrdenesTrabajoOpticaPage />} />
                      <Route path="ars"              element={<ReclamacionesArsPage />} />
                      <Route path="inventario"       element={<InventarioOpticaPage />} />
                    </Route>

                    {/* ── Módulo Taller Mecánico (add-on) ── */}
                    <Route path="/taller" element={<TallerLayout />}>
                      <Route index                      element={<TallerDashboardPage />} />
                      <Route path="vehiculos"           element={<VehiculosPage />} />
                      <Route path="vehiculos/:id"        element={<VehiculoDetallePage />} />
                      <Route path="ordenes"             element={<OrdenesPage />} />
                      <Route path="ordenes/:id"          element={<OrdenDetallePage />} />
                      <Route path="tecnicos"            element={<TecnicosPage />} />
                      <Route path="agenda"              element={<AgendaTallerPage />} />
                      <Route path="catalogo"            element={<CatalogoPage />} />
                      <Route path="reportes"            element={<TallerReportesPage />} />
                    </Route>

                    {/* ── Módulo Clínica (add-on) ── */}
                    <Route path="/clinica" element={<ClinicaLayout />}>
                      <Route index                   element={<ClinicaDashboard />} />
                      <Route path="pacientes"        element={<ClinicaPacientesPage />} />
                      <Route path="pacientes/:id"    element={<ClinicaPacienteDetalle />} />
                      <Route path="agenda"           element={<ClinicaAgendaPage />} />
                      <Route path="sala-espera"      element={<ClinicaSalaEsperaPage />} />
                      <Route path="consultas"        element={<ClinicaConsultaPage />} />
                      <Route path="recetas"          element={<ClinicaRecetasPage />} />
                      <Route path="laboratorio"      element={<ClinicaLaboratorioPage />} />
                      <Route path="procedimientos"   element={<ClinicaProcedimientosPage />} />
                      <Route path="ars"              element={<ClinicaArsPage />} />
                      <Route path="medicos"          element={<ClinicaMedicosPage />} />
                      <Route path="catalogo"         element={<ClinicaCatalogoPage />} />
                      <Route path="reportes"         element={<ClinicaReportesPage />} />
                    </Route>

                    {/* ── Módulo Farmacia (add-on) ── */}
                    <Route path="/farmacia" element={<FarmaciaLayout />}>
                      <Route index                      element={<FarmaciaDashboard />} />
                      <Route path="dispensacion"        element={<FarmaciaDispensacionPage />} />
                      <Route path="medicamentos"        element={<FarmaciaMedicamentosPage />} />
                      <Route path="lotes"               element={<FarmaciaLotesPage />} />
                      <Route path="recepciones"         element={<FarmaciaRecepcionesPage />} />
                      <Route path="narcoticos"          element={<FarmaciaNarcoticoPage />} />
                      <Route path="devoluciones"        element={<FarmaciaDevolucionesPage />} />
                      <Route path="ars"                 element={<FarmaciaArsPage />} />
                      <Route path="reportes"            element={<FarmaciaReportesPage />} />
                    </Route>

                    <Route path="/restaurante"              element={<RestauranteDashboard />} />
                    <Route path="/restaurante/mesas"        element={<MapaMesasPage />} />
                    <Route path="/restaurante/comanda/:id"  element={<ComandaPage />} />
                    <Route path="/restaurante/kds"          element={<KDSPage />} />
                    <Route path="/restaurante/delivery"     element={<DeliveryPage />} />
                    <Route path="/restaurante/reservaciones" element={<ReservacionesPage />} />
                    <Route path="/restaurante/menu"         element={<MenuRsPage />} />
                    <Route path="/restaurante/turnos"       element={<TurnosPage />} />
                    <Route path="/restaurante/reportes"     element={<ReportesRsPage />} />

                    <Route path="/gimnasio" element={<GimnasioLayout />}>
                      <Route index                    element={<GimnasioDashboard />} />
                      <Route path="acceso"            element={<ControlAccesoPage />} />
                      <Route path="miembros"          element={<MiembrosGimnasioPage />} />
                      <Route path="miembros/:id"      element={<FichaMiembroPage />} />
                      <Route path="membresias"        element={<MembresiasPage />} />
                      <Route path="clases"            element={<ClasesGimnasioPage />} />
                      <Route path="entrenadores"      element={<EntrenadoresPage />} />
                      <Route path="rutinas"           element={<RutinasPage />} />
                      <Route path="progreso"          element={<ProgresoPage />} />
                      <Route path="accesos"           element={<AccesosGimnasioPage />} />
                      <Route path="lockers"           element={<LockersPage />} />
                      <Route path="nutricion"         element={<NutricionPage />} />
                      <Route path="tienda"            element={<TiendaGimnasioPage />} />
                      <Route path="reportes"          element={<GimnasioReportesPage />} />
                    </Route>

                    <Route path="/servicios-pro" element={<ServiciosProLayout />}>
                      <Route index                          element={<ServiciosProDashboard />} />
                      <Route path="expedientes"             element={<ExpedientesPage />} />
                      <Route path="expedientes/:id"         element={<ExpedienteDetallePage />} />
                      <Route path="time-tracker"            element={<TimeTrackerPage />} />
                      <Route path="tareas"                  element={<SpTareasPage />} />
                      <Route path="reuniones"               element={<ReunionesPage />} />
                      <Route path="contratos"               element={<SpContratosPage />} />
                      <Route path="honorarios"              element={<HonorariosPage />} />
                      <Route path="retainers"               element={<RetainersPage />} />
                      <Route path="profesionales"           element={<SpProfesionalesPage />} />
                      <Route path="reportes"                element={<SpReportesPage />} />
                    </Route>

                    <Route path="/prestamista" element={<PrestamistalLayout />}>
                      <Route index                      element={<DashboardPrestamistaPage />} />
                      <Route path="deudores"            element={<DeudoresPage />} />
                      <Route path="deudores/:id"        element={<FichaDeudorPage />} />
                      <Route path="productos"           element={<ProductosPrestamoPage />} />
                      <Route path="solicitudes"         element={<SolicitudesPage />} />
                      <Route path="prestamos"           element={<PrestamosPage />} />
                      <Route path="prestamos/:id"       element={<DetallePrestamo />} />
                      <Route path="simulador"           element={<SimuladorPage />} />
                      <Route path="cobranza"            element={<CobranzaPage />} />
                      <Route path="reportes"            element={<ReportesPrestamistaPage />} />
                    </Route>

                    {/* ── Módulo Agro / Finca (add-on) ── */}
                    <Route path="/agro"                 element={<AgroDashboard />} />
                    <Route path="/agro/fincas"          element={<FincasPage />} />
                    <Route path="/agro/parcelas"        element={<ParcelasPage />} />
                    <Route path="/agro/ciclos"          element={<CiclosPage />} />
                    <Route path="/agro/ciclos/:id"      element={<CicloDetallePage />} />
                    <Route path="/agro/cosechas"        element={<CosechasPage />} />
                    <Route path="/agro/ganaderia"       element={<GanaderiaPage />} />
                    <Route path="/agro/ganaderia/:id"   element={<AnimalDetallePage />} />
                    <Route path="/agro/insumos"         element={<InsumosPage />} />
                    <Route path="/agro/maquinaria"      element={<MaquinariaPage />} />
                    <Route path="/agro/reportes"        element={<AgroReportesPage />} />

                    {/* ── Módulo Transporte (add-on) ── */}
                    <Route path="/transporte" element={<TransporteLayout />}>
                      <Route index                   element={<TransporteDashboardPage />} />
                      <Route path="vehiculos"        element={<VehiculosTransportePage />} />
                      <Route path="choferes"         element={<ChoferesTransportePage />} />
                      <Route path="viajes"           element={<ViajesPage />} />
                    </Route>
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
