import { Row, Col, Card, Table, Typography, Spin, Tag, Space, Button, theme, DatePicker, Statistic } from 'antd';
import {
  DollarOutlined, FileTextOutlined, RightOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { reportesApi } from '../../api/reportes.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

// ── Dashboard simplificado para vendedores ────────────────────────────────────
function DashboardVendedor() {
  const [periodo, setPeriodo] = useState(dayjs());
  const mes  = periodo.month() + 1;
  const anio = periodo.year();
  const navigate  = useNavigate();
  const { token } = theme.useToken();

  const { data: misFacturas, isLoading: loadFact } = useQuery<any>({
    queryKey: ['mis-facturas-dash', mes, anio],
    queryFn:  () => api.get(`/facturas?limit=8&mes=${mes}&anio=${anio}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });
  const { data: misCotizaciones, isLoading: loadCot } = useQuery<any>({
    queryKey: ['mis-cot-dash', mes, anio],
    queryFn:  () => api.get(`/cotizaciones?limit=8`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  const factData = Array.isArray(misFacturas?.data) ? misFacturas.data : (Array.isArray(misFacturas) ? misFacturas : []);
  const cotData  = Array.isArray(misCotizaciones?.data) ? misCotizaciones.data : (Array.isArray(misCotizaciones) ? misCotizaciones : []);

  const totalFacturado = factData.reduce((s: number, f: any) => s + Number(f.total ?? 0), 0);
  const totalCotizado  = cotData.reduce((s: number, c: any) => s + Number(c.total ?? 0), 0);
  const cotAceptadas   = cotData.filter((c: any) => c.estado === 'aceptada').length;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>Mi Panel</Title>
        <DatePicker.MonthPicker value={periodo} onChange={v => v && setPeriodo(v)} format="MMMM YYYY" allowClear={false} />
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #0EA5E9' }}>
            <Statistic title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Facturado este mes</span>}
              value={totalFacturado} formatter={v => fmt.money(Number(v))}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
              prefix={<DollarOutlined style={{ color: '#0EA5E9', marginRight: 4 }} />} />
            <Button size="small" type="link" style={{ padding: 0, marginTop: 6 }} onClick={() => navigate('/facturas')}>Ver facturas →</Button>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #10B981' }}>
            <Statistic title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Cotizaciones activas</span>}
              value={cotData.filter((c: any) => ['borrador','enviada'].includes(c.estado)).length}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
              suffix={<span style={{ fontSize: 13, color: token.colorTextTertiary }}> cotizaciones</span>} />
            <Button size="small" type="link" style={{ padding: 0, marginTop: 6 }} onClick={() => navigate('/cotizaciones')}>Ver cotizaciones →</Button>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, borderLeft: '3px solid #F59E0B' }}>
            <Statistic title={<span style={{ fontSize: 12, color: token.colorTextTertiary }}>Cotizaciones aceptadas</span>}
              value={cotAceptadas} valueStyle={{ fontSize: 22, fontWeight: 700, color: '#F59E0B' }}
              suffix={<span style={{ fontSize: 13, color: token.colorTextTertiary }}>/ {cotData.length}</span>} />
            <div style={{ color: token.colorTextTertiary, fontSize: 11, marginTop: 6 }}>Total cotizado: {fmt.money(totalCotizado)}</div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas facturas" extra={<Button size="small" onClick={() => navigate('/facturas')}>Ver todas</Button>}>
            <Table dataSource={factData.slice(0, 6)} rowKey="id" size="small" loading={loadFact} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Folio',   dataIndex: 'folio',  width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',          ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total',  width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={v === 'pagada' ? 'green' : v === 'emitida' ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Mis últimas cotizaciones" extra={<Button size="small" onClick={() => navigate('/cotizaciones')}>Ver todas</Button>}>
            <Table dataSource={cotData.slice(0, 6)} rowKey="id" size="small" loading={loadCot} pagination={false} scroll={{ x: 'max-content' }}
              columns={[
                { title: 'Número', dataIndex: 'numero', width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', key: 'cli',         ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre ?? '—' },
                { title: 'Total',   dataIndex: 'total', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
                { title: 'Estado',  dataIndex: 'estado', width: 90,
                  render: (v: string) => <Tag color={{ aceptada: 'green', enviada: 'blue', borrador: 'default', rechazada: 'red', vencida: 'orange' }[v] ?? 'default'} style={{ fontSize: 10 }}>{v?.toUpperCase()}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Widget base reutilizable ─────────────────────────────────────────────────
function CardWidget({ title, extra, children, noPad }: {
  title: string; extra?: React.ReactNode;
  children: React.ReactNode; noPad?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <Text strong style={{ fontSize: 15 }}>{title}</Text>
        {extra}
      </div>
      <div style={noPad ? undefined : undefined}>{children}</div>
    </div>
  );
}

// ── Dashboard Admin — estilo Cashflow ─────────────────────────────────────────
function DashboardAdmin() {
  const navigate  = useNavigate();
  const { token } = theme.useToken();
  const [grupoAbierto, setGrupoAbierto] = useState(true);

  const mesActual  = dayjs().month() + 1;
  const anioActual = dayjs().year();

  // Cuentas bancarias
  const { data: bancosRaw } = useQuery<any>({
    queryKey: ['bancos-dashboard'],
    queryFn:  () => api.get('/bancos').then((r: any) => r.data?.data ?? r.data),
    staleTime: 120_000,
  });

  // KPIs del mes
  const { data: kpis } = useQuery<any>({
    queryKey: ['kpis-cf', mesActual, anioActual],
    queryFn:  reportesApi.kpis,
    staleTime: 120_000,
  });

  // Actividad (audit log)
  const { data: auditRaw } = useQuery<any>({
    queryKey: ['actividad-cf'],
    queryFn:  () => api.get('/auditoria?limit=12').then((r: any) => r.data?.data ?? r.data),
    staleTime: 30_000,
  });

  // Gastos anuales para el gráfico
  const { data: gastosAnualRaw } = useQuery<any>({
    queryKey: ['gastos-anual-cf', anioActual],
    queryFn:  () => api.get(`/gastos/anual?anio=${anioActual}`).then((r: any) => r.data?.data ?? r.data),
    staleTime: 300_000,
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
  const bancos   = Array.isArray(bancosRaw?.data) ? bancosRaw.data : (Array.isArray(bancosRaw) ? bancosRaw : []);
  const auditLogs = Array.isArray(auditRaw?.data) ? auditRaw.data : (Array.isArray(auditRaw) ? auditRaw : []);
  const facturas  = Array.isArray(factPendRaw) ? factPendRaw : [];
  const gastosAnual = Array.isArray(gastosAnualRaw) ? gastosAnualRaw : (gastosAnualRaw?.data ?? []);

  const balanceBancos = bancos.reduce((s: number, b: any) => s + Number(b.saldo ?? b.balance ?? b.saldoActual ?? 0), 0);

  // Actividad agrupada
  const ahora     = dayjs();
  const actHoy    = auditLogs.filter((l: any) => dayjs(l.createdAt).isSame(ahora, 'day'));
  const actSemana = auditLogs.filter((l: any) => !dayjs(l.createdAt).isSame(ahora, 'day') && dayjs(l.createdAt).isAfter(ahora.startOf('week')));

  // Datos del gráfico — 12 meses
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const d    = dayjs().subtract(11 - i, 'month');
    const mes  = d.month() + 1;
    const anio = d.year();
    const gastoRow = (Array.isArray(gastosAnual) ? gastosAnual : [])
      .find((r: any) => Number(r.mes) === mes && Number(r.anio ?? anioActual) === anio);
    const gasto   = Number(gastoRow?.total ?? 0);
    const ingreso = (mes === mesActual && anio === anioActual)
      ? Number(kpis?.ventas?.mes ?? 0) : 0;
    return { label: d.format('MMM YYYY'), ingreso, gasto };
  });

  return (
    <div>
      <Title level={3} style={{ margin: '0 0 20px', fontWeight: 600 }}>Dashboard</Title>

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
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre ?? b.name ?? 'Cuenta'}</div>
                      <div style={{ fontSize: 11, color: token.colorTextTertiary }}>
                        {b.tipo ?? b.type ?? 'Cuenta'} · Actualizado
                      </div>
                    </div>
                    <Text style={{ fontSize: 13, fontWeight: 500 }}>
                      {fmt.money(Number(b.saldo ?? b.balance ?? b.saldoActual ?? 0))}
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
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0EA5E9', flexShrink: 0, marginTop: 5 }} />
                        <div>
                          <Text style={{ fontSize: 12 }}>{l.descripcion ?? l.accion ?? '—'}</Text>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {dayjs(l.createdAt).format('HH:mm')} · {l.userName ?? ''}
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
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorBorderSecondary, flexShrink: 0, marginTop: 5 }} />
                        <div>
                          <Text style={{ fontSize: 12 }}>{l.descripcion ?? l.accion ?? '—'}</Text>
                          <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
                            {dayjs(l.createdAt).format('DD/MM')} · {l.userName ?? ''}
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

          {/* Widget: Ingresos & Gastos */}
          <CardWidget title="Ingresos & Gastos">
            {/* Leyenda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
                <Text style={{ fontSize: 12 }}>Ingresos</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E5E7EB' }} />
                <Text style={{ fontSize: 12 }}>Gastos</Text>
              </div>
            </div>
            {/* Gráfico de línea */}
            <div style={{ padding: '0 8px 16px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} vertical={false} />
                  <XAxis dataKey="label"
                    tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v.split(' ')[0]} />
                  <YAxis tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: token.colorTextTertiary }}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number, n: string) => [fmt.money(v), n === 'ingreso' ? 'Ingresos' : 'Gastos']}
                    contentStyle={{
                      background: token.colorBgElevated,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 8, fontSize: 12,
                    }} />
                  <Line type="monotone" dataKey="ingreso" stroke="#10B981" strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="gasto" stroke="#9CA3AF" strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardWidget>

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
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  if (user?.role === 'vendedor') return <DashboardVendedor />;
  return <DashboardAdmin />;
}
