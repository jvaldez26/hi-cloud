import { Row, Col, Card, Table, Typography, Tag, Button, theme, DatePicker, Skeleton, message } from 'antd';
import { SkeletonTabla } from '../../components/ui/SkeletonTabla';
import { useSkeletonDelay } from '../../hooks/useSkeletonDelay';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportesApi } from '../../api/reportes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { VideoTutorialButton } from '../../components/ui/TableToolbar';
import { dRD, horaDelDiaRD } from '../../utils/fechaRD';
import { useDashboardWidgets } from '../../hooks/useDashboardWidgets';
import { widgetPorSlug } from './widgets/registro';
import { RejillaDashboard, CeldaWidget, useColumnasDashboard } from './widgets/RejillaDashboard';
import { ALTO_MINIMO } from './widgets/tipos';
import { WidgetCuentasBancos } from './widgets/WidgetCuentasBancos';
import { WidgetActividad } from './widgets/WidgetActividad';
import { WidgetFacturasCobros } from './widgets/WidgetFacturasCobros';
import { MarcoWidget } from './widgets/MarcoWidget';
import { MontarAlVerse } from './widgets/MontarAlVerse';
import { BotonAgregarGrafica } from './widgets/BotonAgregarGrafica';
import { PanelSinGraficas, AvisoPreferenciaDegradada } from './widgets/PanelSinGraficas';

const { Text } = Typography;

// ── Saludo contextual + línea de contexto ────────────────────────────────────
function ContextoHeader() {
  const { user }   = useAuthStore();
  const role       = user?.role ?? 'admin';
  const navigate   = useNavigate();
  const { token }  = theme.useToken();

  // Fechas calculadas UNA SOLA VEZ. El dia va de medianoche a medianoche EN RD,
  // con la hora del servidor: antes salia de la zona del navegador, asi que un
  // equipo mal configurado le pedia al backend un 'hoy' que no era hoy.
  const params = useMemo(() => {
    const now           = dRD();
    const inicioHoy     = now.startOf('day');
    const inicioAyer    = inicioHoy.subtract(1, 'day');
    const mismaHoraAyer = inicioAyer.add(now.diff(inicioHoy));
    return {
      inicioHoy:     inicioHoy.toISOString(),
      ahoraLocal:    now.toISOString(),
      inicioAyer:    inicioAyer.toISOString(),
      mismaHoraAyer: mismaHoraAyer.toISOString(),
    };
  }, []);

  const { data: ctx, isLoading } = useQuery<any>({
    queryKey: ['dash-contexto', params.inicioHoy],
    queryFn:  () => reportesApi.contexto(params),
    staleTime: 2 * 60_000,
  });

  // Saludo según hora LOCAL del navegador
  const hora          = horaDelDiaRD();
  const saludoTexto   = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primerNombre  = (user?.nombre ?? '').split(' ')[0];

  // Resolución de prioridad de la línea de contexto
  const ctxLine = useMemo(() => {
    if (!ctx) return null;
    const esAdmin = role === 'admin' || role === 'contador';

    if (esAdmin && ctx.ecfRechazados > 0) {
      const n = ctx.ecfRechazados;
      return { tipo: 'alert', text: `${n} e-CF rechazado${n > 1 ? 's' : ''} por DGII hoy`, href: '/fiscal/ecf' };
    }
    if (esAdmin && ctx.stockCero > 0) {
      const n = ctx.stockCero;
      return { tipo: 'warn', text: `${n} producto${n > 1 ? 's' : ''} sin existencia`, href: '/inventario' };
    }
    if (esAdmin && ctx.facturasVencidas?.count > 0) {
      const { count: n, total } = ctx.facturasVencidas;
      return { tipo: 'warn', text: `${n} factura${n > 1 ? 's' : ''} vencida${n > 1 ? 's' : ''} por ${fmt.money(total)}`, href: '/cxc' };
    }
    if (ctx.ventasHoy > 0 && ctx.ventasAyerMismaHora > 0) {
      const delta = ((ctx.ventasHoy - ctx.ventasAyerMismaHora) / ctx.ventasAyerMismaHora) * 100;
      const sube  = delta >= 0;
      return {
        tipo: 'compare',
        text: `Llevas ${fmt.money(ctx.ventasHoy)} hoy — ${sube ? '↑' : '↓'} ${Math.abs(delta).toFixed(0)}% ${sube ? 'más' : 'menos'} que ayer a esta hora`,
        href: '/facturas',
        sube,
        superaSemana: ctx.ventasHoy > ctx.ventasHaceSemana,
      };
    }
    if (ctx.ventasHoy > 0) {
      return { tipo: 'info', text: `Llevas ${fmt.money(ctx.ventasHoy)} en ventas hoy`, href: '/facturas' };
    }
    if (ctx.topProductoHoy) {
      return { tipo: 'info', text: `Lo más vendido hoy: ${ctx.topProductoHoy.nombre} · ${fmt.money(ctx.topProductoHoy.total)}`, href: '/facturas' };
    }
    return { tipo: 'vacio', text: null, href: null };
  }, [ctx, role]);

  return (
    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {isLoading ? (
        <Skeleton active title={{ width: 320 }} paragraph={false} />
      ) : (
        <div
          onClick={() => ctxLine?.href && navigate(ctxLine.href)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: ctxLine?.href ? 'pointer' : 'default',
            flexWrap: 'wrap',
            rowGap: 2,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 500, color: token.colorTextSecondary, lineHeight: 1.4 }}>
            {saludoTexto}, {primerNombre}
          </span>

          {ctxLine?.tipo === 'vacio' ? (
            <>
              <span style={{ margin: '0 8px', color: token.colorTextTertiary, fontSize: 13 }}>·</span>
              <span style={{ fontSize: 14, color: token.colorTextTertiary }}>
                Sin ventas aún —{' '}
                <a
                  onClick={e => { e.stopPropagation(); navigate('/pos'); }}
                  style={{ color: token.colorPrimary, textDecoration: 'underline' }}
                >
                  abrir POS
                </a>
              </span>
            </>
          ) : ctxLine ? (
            <>
              <span style={{ margin: '0 8px', color: token.colorTextTertiary, fontSize: 13 }}>·</span>
              <span
                style={{ fontSize: 14, color: token.colorTextSecondary }}
                onMouseEnter={e => { if (ctxLine.href) (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
              >
                {ctxLine.text}
              </span>
              {ctxLine.superaSemana && (
                <span style={{
                  marginLeft: 10, fontSize: 11, fontWeight: 500,
                  color: token.colorTextTertiary, letterSpacing: '0.01em',
                }}>
                  ↑ semana pasada
                </span>
              )}
            </>
          ) : null}
        </div>
      )}
      </div>
      <VideoTutorialButton />
    </div>
  );
}

// ── Dashboard simplificado para vendedores ────────────────────────────────────
function DashboardVendedor() {
  const [periodo, setPeriodo] = useState(dayjs());
  const mes  = periodo.month() + 1;
  const anio = periodo.year();
  const navigate  = useNavigate();
  const { token } = theme.useToken();

  const desde = periodo.startOf('month').format('YYYY-MM-DD');
  const hasta  = periodo.endOf('month').format('YYYY-MM-DD');

  const { data: misFacturas, isLoading: loadFact } = useQuery<any>({
    queryKey: ['mis-facturas-dash', mes, anio],
    queryFn:  () => api.get(`/facturas?limit=8&desde=${desde}&hasta=${hasta}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: misCotizaciones, isLoading: loadCot } = useQuery<any>({
    queryKey: ['mis-cot-dash', mes, anio],
    queryFn:  () => api.get(`/cotizaciones?limit=8`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  const factData = Array.isArray(misFacturas?.data) ? misFacturas.data : (Array.isArray(misFacturas) ? misFacturas : []);
  const cotData  = Array.isArray(misCotizaciones?.data) ? misCotizaciones.data : (Array.isArray(misCotizaciones) ? misCotizaciones : []);
  const showSkFact = useSkeletonDelay(loadFact, 200);
  const showSkCot  = useSkeletonDelay(loadCot,  200);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <ContextoHeader />
        <DatePicker.MonthPicker value={periodo} onChange={v => v && setPeriodo(v)} format="MMMM YYYY" allowClear={false} />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas facturas" extra={<Button size="small" onClick={() => navigate('/facturas')}>Ver todas</Button>}>
            {showSkFact ? <SkeletonTabla rows={4} cols={4} /> : <Table dataSource={factData.slice(0, 6)} rowKey="id" size="small" loading={loadFact} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Folio',   dataIndex: 'folio',  width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',          ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total',  width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'green' : v === 'emitida' ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas cotizaciones" extra={<Button size="small" onClick={() => navigate('/cotizaciones')}>Ver todas</Button>}>
            {showSkCot ? <SkeletonTabla rows={4} cols={4} /> : <Table dataSource={cotData.slice(0, 6)} rowKey="id" size="small" loading={loadCot} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Número', dataIndex: 'numero', width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',         ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={{ aceptada: 'green', enviada: 'blue', borrador: 'default', rechazada: 'red', vencida: 'orange' }[v] ?? 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Dashboard Admin — estilo Cashflow ─────────────────────────────────────────
function DashboardAdmin() {
  const columnas = useColumnasDashboard();
  const qc       = useQueryClient();

  // Que graficas ve ESTE usuario en ESTA empresa. Si la preferencia falla, el
  // hook cae a las cuatro de siempre: nadie se queda sin panel por eso.
  const {
    slugs, disponibles, degradado,
    agregar, quitar, aplicar, reponerPorDefecto,
  } = useDashboardWidgets();

  // Listener del evento 'dashboard:refresh' que dispara el logo del sidebar.
  // Invalida, no consulta: las consultas viven dentro de cada widget.
  const refreshAll = useCallback(() => {
    for (const clave of [
      'bancos-dashboard', 'fact-pend-cf',
      'ingresos-gastos-anual', 'anios-con-datos',
      'antiguedad-cobrar', 'antiguedad-pagar', 'resumen-gastos-dash',
    ]) qc.invalidateQueries({ queryKey: [clave] });
  }, [qc]);

  useEffect(() => {
    window.addEventListener('dashboard:refresh', refreshAll);
    return () => window.removeEventListener('dashboard:refresh', refreshAll);
  }, [refreshAll]);

  // Confirmacion breve con deshacer. El deshacer manda otro PUT en vez de
  // retrasar el primero: un guardado pendiente se pierde si el usuario navega,
  // y perder una preferencia por ahorrar una peticion no compensa.
  const avisar = useCallback((texto: string, listaAnterior: string[]) => {
    message.open({
      type: 'success',
      content: (
        <span>
          {texto}{' '}
          <a onClick={() => { message.destroy(); aplicar(listaAnterior); }}>Deshacer</a>
        </span>
      ),
      duration: 4,
    });
  }, [aplicar]);

  const alAgregar = useCallback((slug: string) => {
    const antes = slugs;
    const w = widgetPorSlug(slug);
    agregar(slug);
    avisar(`${w?.titulo ?? 'Gráfica'} agregada.`, antes);
  }, [slugs, agregar, avisar]);

  const alQuitar = useCallback((slug: string) => {
    const antes = slugs;
    const w = widgetPorSlug(slug);
    quitar(slug);
    avisar(`${w?.titulo ?? 'Gráfica'} quitada.`, antes);
  }, [slugs, quitar, avisar]);

  const botonAgregar = (
    <BotonAgregarGrafica disponibles={disponibles} onAgregar={alAgregar} />
  );

  /**
   * Las tres fijas van DENTRO de la misma rejilla que las configurables.
   * Si se quedaran fuera, en su propia fila, el hueco que este rediseno viene a
   * quitar solo se mudaria arriba.
   */
  const FIJAS = [
    { clave: 'bancos',    Componente: WidgetCuentasBancos },
    { clave: 'actividad', Componente: WidgetActividad },
    { clave: 'facturas',  Componente: WidgetFacturasCobros },
  ];

  return (
    <div>
      <ContextoHeader />

      {degradado && <AvisoPreferenciaDegradada />}

      {/* El boton vive arriba, junto al saludo: es lo que convierte el panel en
          algo que se configura, y tiene que verse sin buscarlo. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {botonAgregar}
      </div>

      <RejillaDashboard columnas={columnas}>
        {FIJAS.map(({ clave, Componente }) => (
          <CeldaWidget key={clave} ancho="media" columnas={columnas}>
            <MontarAlVerse alto={ALTO_MINIMO.media}>
              <Componente />
            </MontarAlVerse>
          </CeldaWidget>
        ))}

        {/* Las del usuario, en SU orden. Sin relleno denso: el panel no reordena
            lo que la persona coloco. */}
        {slugs.map(slug => {
          const w = widgetPorSlug(slug);
          if (!w) return null;
          return (
            <CeldaWidget key={slug} ancho={w.ancho} columnas={columnas}>
              <MontarAlVerse alto={ALTO_MINIMO[w.ancho]}>
                <MarcoWidget titulo={w.titulo} onQuitar={() => alQuitar(slug)}>
                  <w.Componente />
                </MarcoWidget>
              </MontarAlVerse>
            </CeldaWidget>
          );
        })}
      </RejillaDashboard>

      {/* Se quedo sin ninguna: mensaje con las dos salidas, nunca un vacio del
          que no se sepa salir. */}
      {slugs.length === 0 && (
        <PanelSinGraficas onReponer={reponerPorDefecto} botonAgregar={botonAgregar} />
      )}
    </div>
  );
}


export default function DashboardPage() {
  const { user } = useAuthStore();
  if (user?.role === 'vendedor') return <DashboardVendedor />;
  return <DashboardAdmin />;
}