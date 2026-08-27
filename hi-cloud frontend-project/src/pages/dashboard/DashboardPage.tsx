import { Row, Col, Card, Table, Typography, Tag, Button, theme, DatePicker, Skeleton, message } from 'antd';
import { SkeletonTabla } from '../../components/ui/SkeletonTabla';
import { useSkeletonDelay } from '../../hooks/useSkeletonDelay';
import { DollarOutlined, FileTextOutlined } from '@ant-design/icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
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
import { CardWidget } from './widgets/CardWidget';
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
  const navigate  = useNavigate();
  const { token } = theme.useToken();
  const qc        = useQueryClient();
  const isMobile  = useMobile();
  const [grupoAbierto,  setGrupoAbierto]  = useState(true);

  // Que graficas ve ESTE usuario en ESTA empresa. Si la preferencia falla, el
  // hook cae a las cuatro de siempre: nadie se queda sin panel por eso.
  const {
    slugs, disponibles, porDefecto, degradado,
    agregar, quitar, aplicar, reponerPorDefecto,
  } = useDashboardWidgets();

  // Confirmacion breve con deshacer. El deshacer manda otro PUT en vez de
  // retrasar el primero: un guardado pendiente se pierde si el usuario navega,
  //  y perder una preferencia por ahorrar una peticion no compensa.
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
  const tarjetas  = slugs
    .map(widgetPorSlug)
    .filter((w): w is NonNullable<typeof w> => !!w && w.ancho === 'tarjeta');
  // Listener para el evento 'dashboard:refresh' disparado por el logo del sidebar
  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['bancos-dashboard'] });
    qc.invalidateQueries({ queryKey: ['ingresos-gastos-anual'] });
    qc.invalidateQueries({ queryKey: ['anios-con-datos'] });
    qc.invalidateQueries({ queryKey: ['fact-pend-cf'] });
    qc.invalidateQueries({ queryKey: ['antiguedad-cobrar'] });
    qc.invalidateQueries({ queryKey: ['antiguedad-pagar'] });
    qc.invalidateQueries({ queryKey: ['resumen-gastos-dash'] });
  }, [qc]);

  useEffect(() => {
    window.addEventListener('dashboard:refresh', refreshAll);
    return () => window.removeEventListener('dashboard:refresh', refreshAll);
  }, [refreshAll]);

  // Widget tesorería: cuentas + balance + actividad financiera
  const { data: tesoreriaRaw } = useQuery<any>({
    queryKey: ['bancos-dashboard'],
    queryFn:  () => api.get('/tesoreria/dashboard').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // Facturas pendientes
  const { data: factPendRaw } = useQuery<any>({
    queryKey: ['fact-pend-cf'],
    queryFn:  () => api.get('/facturas?limit=8&estado=emitida').then((r: any) => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    staleTime: 60_000,
  });

  // Normalizar datos
  const bancos      = tesoreriaRaw?.cuentas ?? [];
  const balanceBancos = tesoreriaRaw?.balanceTotal ?? 0;
  const actHoy    = tesoreriaRaw?.actividad?.hoy    ?? [];
  const actSemana = tesoreriaRaw?.actividad?.semana ?? [];

  const facturas    = Array.isArray(factPendRaw) ? factPendRaw : [];

  const ahora = dayjs();

  // Enero a diciembre del año elegido. El backend ya devuelve los 12 meses con
  // ceros donde no hay datos: los meses futuros salen VACÍOS, no ocultos — ver
  // el año completo con la parte que falta es información.
  return (
    <div>
      <ContextoHeader />

      {degradado && <AvisoPreferenciaDegradada />}

      {/* El boton vive arriba, junto al saludo: es lo que convierte el panel en
          algo que se configura, y tiene que verse sin buscarlo. */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        marginBottom: 12,
      }}>
        {botonAgregar}
      </div>

      <Row gutter={[16, 0]}>
        {/* ══ Columna izquierda ══════════════════════════════════════ */}
        <Col xs={24} lg={9}>

          {/* Widget: Cuentas de Bancos */}
          <CardWidget
            title="Cuentas de Bancos"
            extra={
              <Button type="text" size="small" style={{ color: token.colorTextTertiary, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                onClick={() => navigate('/bancos')}>⋯</Button>
            }
          >
            {/* Grupo expandible */}
            <div
              onClick={() => setGrupoAbierto(v => !v)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', cursor: 'pointer',
                background: grupoAbierto ? token.colorFillAlter : 'transparent',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: token.colorTextSecondary }}>
                <span style={{ fontSize: 10 }}>{grupoAbierto ? '▾' : '›'}</span>
                Efectivo y Cuentas
              </span>
              <Text style={{ fontSize: 13, fontWeight: 500 }}>
                {fmt.money(balanceBancos)}
              </Text>
            </div>

            {/* Cuentas individuales */}
            {grupoAbierto && (
              bancos.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Sin cuentas configuradas</Text>
                  <div>
                    <Button type="link" size="small" onClick={() => navigate('/bancos')}>
                      Ir a Bancos →
                    </Button>
                  </div>
                </div>
              ) : (
                bancos.slice(0, 5).map((b: any, i: number) => (
                  <div key={b.id ?? i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px 10px 24px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: '#10B981',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <DollarOutlined style={{ color: '#FFF', fontSize: 16 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre ?? 'Cuenta'}</div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        {b.tipo ?? 'corriente'} · {b.moneda ?? 'DOP'}
                      </div>
                    </div>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>
                      {fmt.money(Number(b.saldo ?? 0))}
                    </Text>
                  </div>
                ))
              )
            )}

            {/* Balance total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: token.colorFillAlter,
            }}>
              <Text strong style={{ fontSize: 14 }}>Balance</Text>
              <Text strong style={{ fontSize: 14, color: '#0EA5E9' }}>
                DOP${balanceBancos.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </Text>
            </div>
          </CardWidget>

          {/* Widget: Actividad */}
          <CardWidget title="Actividad">
            {actHoy.length === 0 && actSemana.length === 0 ? (
              <>
                <div style={{ padding: '10px 16px 12px' }}>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
                  <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
                  </div>
                </div>
                <div style={{ padding: '10px 16px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                  <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
                  <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>No hay data para mostrar...</Text>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {actHoy.length > 0 && (
                  <div style={{ padding: '10px 16px' }}>
                    <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Hoy</Text>
                    <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
                    {actHoy.slice(0, 5).map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                              color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                              {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </Text>
                          </div>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {l.hora ?? dRD(l.fecha).format('HH:mm')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {actSemana.length > 0 && (
                  <div style={{ padding: '10px 16px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                    <Text style={{ fontSize: 12, color: token.colorTextTertiary }}>Esta semana</Text>
                    <div style={{ height: 1, background: token.colorBorderSecondary, margin: '4px 0 8px' }} />
                    {actSemana.slice(0, 5).map((l: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                            <Text style={{ fontSize: 12 }}>{l.descripcion ?? '—'}</Text>
                            <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0,
                              color: l.tipo === 'ingreso' ? '#10B981' : '#EF4444' }}>
                              {l.tipo === 'ingreso' ? '+' : '-'}RD${Number(l.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </Text>
                          </div>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {dayjs(l.fecha).format('DD/MM')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardWidget>
        </Col>

        {/* ══ Columna derecha ════════════════════════════════════════ */}
        <Col xs={24} lg={15}>

          {/* Gráficas anchas. Cada una trae su consulta dentro y solo se monta
              cuando el hueco se acerca a la pantalla: si no está montada, no
              pide nada. */}
          {slugs.map(slug => {
            const w = widgetPorSlug(slug);
            if (!w || w.ancho !== 'principal') return null;
            return (
              <MontarAlVerse key={slug} alto={340}>
                <MarcoWidget titulo={w.titulo} onQuitar={() => alQuitar(slug)}>
                  <w.Componente />
                </MarcoWidget>
              </MontarAlVerse>
            );
          })}

          {/* Widget: Facturas & Cobros */}
          <CardWidget
            title="Facturas & Cobros"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/cxc')}
                style={{ fontSize: 12 }}>Ver todo →</Button>
            }
          >
            {facturas.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Sin facturas pendientes de cobro</Text>
                <div style={{ marginTop: 8 }}>
                  <Button type="link" size="small" onClick={() => navigate('/facturas')}>Ir a Facturas →</Button>
                </div>
              </div>
            ) : (
              <div>
                {facturas.slice(0, 8).map((f: any, i: number) => (
                  <div
                    key={f.id ?? i}
                    onClick={() => navigate(`/facturas/${f.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px',
                      borderBottom: i < Math.min(facturas.length, 8) - 1
                        ? `1px solid ${token.colorBorderSecondary}` : 'none',
                      cursor: 'pointer', transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = token.colorFillAlter)}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileTextOutlined style={{ color: '#0EA5E9', fontSize: 16 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: 500, display: 'block' }} ellipsis>
                        {f.cliente?.nombre ?? 'Cliente'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {f.folio ?? f.numero} · {f.fecha ? dayjs(f.fecha).format('DD/MM/YYYY') : ''}
                      </Text>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0EA5E9' }}>
                        {fmt.money(Number(f.total ?? 0))}
                      </div>
                      <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>PENDIENTE</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardWidget>
        </Col>
      </Row>

      {/* Gráficas de tarjeta, en rejilla de tres. En móvil se apilan. */}
      {tarjetas.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 16,
          marginTop: 16,
        }}
          className="dashboard-widgets-row"
        >
          {tarjetas.map(w => (
            <MontarAlVerse key={w.slug} alto={300}>
              <MarcoWidget titulo={w.titulo} onQuitar={() => alQuitar(w.slug)}>
                <w.Componente />
              </MarcoWidget>
            </MontarAlVerse>
          ))}
        </div>
      )}

      {/* Se quedó sin ninguna: mensaje con las dos salidas, nunca un vacío
          del que no se sepa salir. */}
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