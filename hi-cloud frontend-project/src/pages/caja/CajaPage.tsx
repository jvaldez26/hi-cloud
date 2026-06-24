import { useState, useMemo } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Card, Row, Col, Typography, Statistic, Button, InputNumber,
         Table, Tag, Modal, Form, Input, Select, Space, Alert, Spin, message, Avatar,
         theme, Drawer, Descriptions, Divider, DatePicker } from 'antd';
import { UnlockOutlined, LockOutlined, HistoryOutlined,
         RollbackOutlined, WarningOutlined,
         PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { imprimirHtml } from '../../utils/printUtils';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const cajaApi = {
  hoy:       ()                          => api.get('/caja/hoy').then(r => r.data?.data ?? r.data),
  cajeros:   ()                          => api.get('/caja/cajeros').then(r => r.data?.data ?? r.data),
  abrir:     (body: any)                 => api.post('/caja/abrir', body).then(r => r.data?.data),
  cerrar:    (id: number, body: any)     => api.patch(`/caja/${id}/cerrar`, body).then(r => r.data?.data),
  anular:    (id: number, motivo: string) => api.patch(`/caja/${id}/anular`, { motivo }).then(r => r.data?.data),
  historial: (p = 1, mes?: number, anio?: number) =>
    api.get(`/caja/historial?page=${p}${mes ? `&mes=${mes}&anio=${anio}` : ''}`).then(r => r.data?.data),
  resumen:   (mes: number, anio: number) => api.get(`/caja/resumen?mes=${mes}&anio=${anio}`).then(r => r.data?.data),
};

const estadoColor: Record<string, string> = {
  abierta: 'green', cerrada: 'blue', revisada: 'purple',
};

function avatarColor(name: string) {
  const c = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#0891B2'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % c.length;
  return c[h];
}

export default function CajaPage() {
  const { token }  = theme.useToken();
  const isMobile   = useMobile();
  const [cerrarTarget, setCerrarTarget] = useState<{
    id: number; nombre: string;
    saldoEsperado: number; saldoApertura: number;
    ventasEfectivo: number; ventasTarjeta: number; ventasTransferencia: number;
    cobrosRecibidos: number; totalAnticipos: number; gastosEfectivo: number; retiros: number;
    cantidadTransacciones: number; fecha: string;
  } | null>(null);
  const [anularTarget, setAnularTarget] = useState<{ id: number; nombre: string; fecha: string } | null>(null);
  const [detalleCierre, setDetalleCierre] = useState<any>(null);
  const [saldoFisicoInput, setSaldoFisicoInput] = useState<number>(0);
  const [openAbrir, setOpenAbrir] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histFecha, setHistFecha] = useState(() => dayjs());
  const [form]       = Form.useForm();
  const [formAnular] = Form.useForm();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const puedeAnular = user?.role === 'admin' || user?.role === 'contador' || user?.role === 'super_admin';
  const esAdmin     = user?.role === 'admin' || user?.role === 'contador' || user?.role === 'super_admin';

  const COLS_DEF = [
    { key: 'fecha',                   label: 'Fecha' },
    { key: 'vendedorNombre',          label: 'Cajero' },
    { key: 'estado',                  label: 'Estado' },
    { key: 'saldoApertura',           label: 'Apertura' },
    { key: 'ing',                     label: 'Total Ingresos' },
    { key: 'saldoCierre',             label: 'Esperado' },
    { key: 'saldoFisico',             label: 'Contado' },
    { key: 'diferencia',              label: 'Diferencia' },
    { key: 'cantidadTransacciones',   label: 'Trans.' },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('caja-historial', COLS_DEF);

  const { data: cajaData, isLoading } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn:  cajaApi.hoy,
    refetchInterval:      5_000,   // cada 5s — detecta cajas abiertas desde el POS
    refetchOnWindowFocus: true,    // refresca al volver a esta pestaña
    staleTime:            0,       // siempre stale
  });

  const { data: cajeros = [] } = useQuery<any[]>({
    queryKey: ['caja-cajeros'],
    queryFn:  cajaApi.cajeros,
    staleTime: 60_000,
  });

  const { data: historial } = useQuery({
    queryKey: ['caja-hist', histPage, histFecha.month() + 1, histFecha.year()],
    queryFn:  () => cajaApi.historial(histPage, histFecha.month() + 1, histFecha.year()),
  });

  const mes  = dayjs().month() + 1;
  const anio = dayjs().year();
  const { data: resumenMes } = useQuery({
    queryKey: ['caja-resumen', mes, anio],
    queryFn:  () => cajaApi.resumen(mes, anio),
  });

  const abrirMut = useMutation({
    mutationFn: cajaApi.abrir,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setOpenAbrir(false); form.resetFields();
      message.success('Caja abierta');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const cerrarMut = useMutation({
    mutationFn: ({ id, body }: any) => cajaApi.cerrar(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setCerrarTarget(null); form.resetFields(); setSaldoFisicoInput(0);
      message.success('Caja cerrada correctamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const anularMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => cajaApi.anular(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setAnularTarget(null); formAnular.resetFields();
      message.success('Cierre anulado — la caja está abierta nuevamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  const sinApertura = !cajaData || (cajaData as any).estado === 'sin_apertura';
  const cajas: any[] = sinApertura
    ? []
    : Array.isArray((cajaData as any).cajas)
      ? (cajaData as any).cajas
      : [(cajaData as any)];

  const [searchHistorial, setSearchHistorial] = useState('');

  // El backend ya excluye 'abierta' y filtra por mes — solo filtro local de texto
  const historialCerrados = useMemo(() => {
    const base: any[] = historial?.data ?? [];
    if (!searchHistorial.trim()) return base;
    const q = searchHistorial.toLowerCase();
    return base.filter((r: any) =>
      String(r.vendedorNombre ?? '').toLowerCase().includes(q) ||
      String(r.fecha ?? '').includes(q)
    );
  }, [historial, searchHistorial]);

  // Calcular diferencia en tiempo real para el modal de cierre
  const diferenciaCierre = saldoFisicoInput - (cerrarTarget?.saldoEsperado ?? 0);

  const imprimirCierre = (r: any) => {
    const totalIngresos = (Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0)).toFixed(2);
    const diferencia = Number(r.diferencia ?? 0);
    const difColor = diferencia === 0 ? '#10b981' : diferencia > 0 ? '#3b82f6' : '#ef4444';
    const difLabel = diferencia === 0 ? '✅ Cuadrado' : diferencia > 0 ? `+${fmt.money(diferencia)} sobrante` : `${fmt.money(diferencia)} faltante`;
    imprimirHtml(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Cierre de Caja</title>
<style>body{font-family:'Courier New',monospace;max-width:320px;margin:0 auto;padding:12px;font-size:13px}
h2{text-align:center;font-size:16px;margin:0 0 4px}
.center{text-align:center}.sep{border:none;border-top:1px dashed #999;margin:8px 0}
.row{display:flex;justify-content:space-between;margin:3px 0}
.total{font-weight:bold;font-size:15px}.difBox{padding:6px;border-radius:4px;text-align:center;font-weight:bold;margin:8px 0}</style>
</head><body>
<h2>HiCloud ERP</h2>
<p class="center">CIERRE DE CAJA</p>
<hr class="sep">
<div class="row"><span>Cajero:</span><span>${r.vendedorNombre ?? 'Administrador'}</span></div>
<div class="row"><span>Fecha:</span><span>${r.fecha}</span></div>
<div class="row"><span>Estado:</span><span>${r.estado?.toUpperCase()}</span></div>
<hr class="sep">
<b>INGRESOS DEL TURNO</b>
<div class="row"><span>Ventas efectivo:</span><span>${fmt.money(Number(r.ventasEfectivo ?? 0))}</span></div>
<div class="row"><span>Ventas tarjeta:</span><span>${fmt.money(Number(r.ventasTarjeta ?? 0))}</span></div>
<div class="row"><span>Ventas transfer.:</span><span>${fmt.money(Number(r.ventasTransferencia ?? 0))}</span></div>
<div class="row"><span>Cobros recibidos:</span><span>${fmt.money(Number(r.cobrosRecibidos ?? 0))}</span></div>
<hr class="sep">
<b>EGRESOS</b>
<div class="row"><span>Gastos:</span><span>${fmt.money(Number(r.gastosEfectivo ?? 0))}</span></div>
<div class="row"><span>Retiros:</span><span>${fmt.money(Number(r.retiros ?? 0))}</span></div>
<hr class="sep">
<b>CUADRE</b>
<div class="row"><span>Saldo apertura:</span><span>${fmt.money(Number(r.saldoApertura ?? 0))}</span></div>
<div class="row"><span>Efectivo esperado:</span><span>${fmt.money(Number(r.saldoCierre ?? 0))}</span></div>
<div class="row"><span>Efectivo contado:</span><span>${fmt.money(Number(r.saldoFisico ?? 0))}</span></div>
<div class="difBox" style="background:${difColor}22;color:${difColor};border:1px solid ${difColor}66">${difLabel}</div>
<div class="row"><span>Total ingresos:</span><span class="total">${fmt.money(Number(totalIngresos))}</span></div>
<hr class="sep">
<p class="center" style="font-size:11px">${r.cantidadTransacciones ?? 0} transacciones</p>
<p class="center" style="font-size:10px;color:#666">${new Date().toLocaleString('es-DO')}</p>
</body></html>`);
  };

  const imprimirPDFCierre = async (r: any) => {
    try {
      const res = await api.get(`/caja/${r.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const win = window.open(url, '_blank');
      if (!win) { imprimirCierre(r); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch {
      // PDF backend no configurado → generar impresión HTML como alternativa
      imprimirCierre(r);
    }
  };

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Caja Diaria</Title></Col>
        <Col>
          <Space wrap>
            <RefreshByKeyButton queryKey={['caja-hoy']} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <VideoTutorialButton />
            <Button
              type="primary"
              icon={<UnlockOutlined />}
              size={isMobile ? 'large' : 'middle'}
              block={isMobile}
              onClick={() => {
                setOpenAbrir(true);
                form.setFieldsValue({
                  saldoApertura: 0,
                  vendedorId: esAdmin ? undefined : user?.id,
                  notas: undefined,
                });
              }}
            >
              Abrir caja
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Estado del día */}
      {isLoading ? <Spin /> : sinApertura ? (
        <Alert type="warning" showIcon
          message="No hay cajas abiertas hoy"
          description="Abre una caja por cada cajero para registrar transacciones del día."
          action={<Button onClick={() => setOpenAbrir(true)}>Abrir caja ahora</Button>}
          style={{ marginBottom: 16 }} />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {cajas.map((caja, i) => {
              const totalIngresos = Number(caja.ventasEfectivo ?? 0) + Number(caja.ventasTarjeta ?? 0) + Number(caja.ventasTransferencia ?? 0);
              const saldoEsperado = Number(caja.saldoApertura ?? 0) + totalIngresos
                - Number(caja.gastosEfectivo ?? 0) - Number(caja.retiros ?? 0);
              const nombre = caja.vendedorNombre ?? 'Administrador';
              return (
                <Col xs={24} lg={12} key={caja.id}>
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <Card size="small"
                      style={{ borderColor: caja.estado === 'abierta' ? '#10b981' : '#94a3b8', borderWidth: 1.5 }}
                      title={
                        <Space>
                          <Avatar size={28} style={{ background: avatarColor(nombre), fontSize: 12 }}>
                            {nombre.charAt(0).toUpperCase()}
                          </Avatar>
                          <Text strong>{nombre}</Text>
                          <Tag color={estadoColor[caja.estado]} style={{ margin: 0 }}>
                            {caja.estado.toUpperCase()}
                          </Tag>
                        </Space>
                      }
                      extra={
                        caja.estado === 'abierta' ? (
                          <Button size="small" danger icon={<LockOutlined />}
                            onClick={() => {
                            setCerrarTarget({
                              id: caja.id, nombre, saldoEsperado,
                              saldoApertura:          Number(caja.saldoApertura ?? 0),
                              ventasEfectivo:         Number(caja.ventasEfectivo ?? 0),
                              ventasTarjeta:          Number(caja.ventasTarjeta ?? 0),
                              ventasTransferencia:    Number(caja.ventasTransferencia ?? 0),
                              cobrosRecibidos:        Number(caja.cobrosRecibidos ?? 0),
                              totalAnticipos:         Number(caja.totalAnticipos  ?? 0),
                              gastosEfectivo:         Number(caja.gastosEfectivo  ?? 0),
                              retiros:                Number(caja.retiros ?? 0),
                              cantidadTransacciones:  caja.cantidadTransacciones ?? 0,
                              fecha:                  caja.fecha ?? '',
                            });
                            form.resetFields(); setSaldoFisicoInput(0);
                          }}>
                            Cerrar caja
                          </Button>
                        ) : null
                      }
                    >
                      <Row gutter={[8, 8]}>
                        {[
                          { title: 'Apertura',      value: caja.saldoApertura,  color: '#6b7280' },
                          { title: 'Efectivo',       value: caja.ventasEfectivo, color: '#10b981' },
                          { title: 'Tarjeta',        value: caja.ventasTarjeta,  color: '#1677ff' },
                          { title: 'Saldo esperado', value: saldoEsperado,       color: '#7c3aed' },
                        ].map(k => (
                          <Col xs={12} sm={6} key={k.title}>
                            <Statistic title={k.title} value={k.value ?? 0}
                              formatter={v => fmt.money(Number(v))}
                              valueStyle={{ color: k.color, fontSize: 13 }} />
                          </Col>
                        ))}
                      </Row>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                        {caja.cantidadTransacciones ?? 0} transacciones · {fmt.date(caja.fecha)}
                        {caja.estado === 'cerrada' && Number(caja.diferencia) !== 0 && (
                          <Text style={{ marginLeft: 8, fontWeight: 600, color: Number(caja.diferencia) > 0 ? '#10b981' : '#ef4444' }}>
                            · Diferencia: {fmt.money(Math.abs(Number(caja.diferencia)))} {Number(caja.diferencia) > 0 ? '(sobrante)' : '(faltante)'}
                          </Text>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                </Col>
              );
            })}
          </Row>

          {resumenMes && (
            <Card title={`Resumen ${dayjs().format('MMMM YYYY')}`} size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 0]}>
                <Col xs={12} sm={6}><Statistic title="Total Ventas"     value={resumenMes.totalVentas}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Total Cobros"     value={resumenMes.totalCobros}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Diferencia Acum." value={resumenMes.diferenciaTotal}   formatter={v => fmt.money(Number(v))} valueStyle={{ color: Number(resumenMes.diferenciaTotal) < 0 ? '#ef4444' : '#10b981' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Días con diferencia" value={resumenMes.diasConDiferencia} /></Col>
              </Row>
            </Card>
          )}
        </>
      )}

      {/* Historial — solo muestra cierres COMPLETADOS (no abierta) */}
      <Card
        title={<><HistoryOutlined /> Historial de Cierres</>}
        extra={
          <Space wrap>
            <DatePicker
              picker="month"
              value={histFecha}
              onChange={v => { setHistFecha(v ?? dayjs()); setHistPage(1); setSearchHistorial(''); }}
              format="MMMM YYYY"
              allowClear={false}
              size="small"
              style={{ width: 140 }}
              disabledDate={d => d.isAfter(dayjs(), 'month')}
            />
            <Input
              placeholder="Buscar cajero..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={searchHistorial}
              onChange={e => setSearchHistorial(e.target.value)}
              allowClear
              size="small"
              style={{ width: 180 }}
            />
          </Space>
        }
      >
        {historialCerrados.length === 0 && !isLoading && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Sin cierres registrados aún. Los cierres completados aparecerán aquí.
          </Text>
        )}
        <Table size="small" scroll={{ x: 'max-content' }}
          dataSource={historialCerrados}
          rowKey="id"
          pagination={{
            current: histPage,
            pageSize: 20,
            total: historial?.meta?.total ?? 0,
            showTotal: (t: number) => `${t} cierres`,
            showSizeChanger: false,
            onChange: (p: number) => { setHistPage(p); setSearchHistorial(''); },
          }}
          columns={filterColumns([
            { title: 'Fecha',  dataIndex: 'fecha',  width: 100, render: (v: string) => fmt.date(v) },
            {
              title: 'Cajero', dataIndex: 'vendedorNombre', width: 150,
              render: (v: string) => {
                const n = v ?? 'Administrador';
                return (
                  <Space size={4}>
                    <Avatar size={20} style={{ background: avatarColor(n), fontSize: 10 }}>{n.charAt(0)}</Avatar>
                    <Text style={{ fontSize: 12 }}>{n}</Text>
                  </Space>
                );
              },
            },
            { title: 'Estado', dataIndex: 'estado', width: 90,
              render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v?.toUpperCase()}</Tag> },
            { title: 'Apertura',       dataIndex: 'saldoApertura', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
            { title: 'Total Ingresos', key: 'ing', width: 120, align: 'right' as const,
              render: (_: any, r: any) => fmt.money(Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0)) },
            { title: 'Esperado',   dataIndex: 'saldoCierre', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
            { title: 'Contado',    dataIndex: 'saldoFisico', width: 110, align: 'right' as const, render: (v: number) => fmt.money(v) },
            { title: 'Diferencia', dataIndex: 'diferencia', width: 110, align: 'right' as const,
              render: (v: number) => (
                <Text strong style={{ color: v === 0 ? token.colorSuccess : v > 0 ? token.colorPrimary : token.colorError }}>
                  {v > 0 ? '+' : ''}{fmt.money(v)}
                </Text>
              )},
            { title: 'Trans.', dataIndex: 'cantidadTransacciones', width: 70, align: 'center' as const },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setDetalleCierre(r)}
                  viewLabel="Ver detalle del cierre"
                  items={[
                    { key: 'imprimir', label: 'Imprimir cierre', icon: <PrinterOutlined />, onClick: () => imprimirCierre(r) },
                    { key: 'pdf',      label: 'Imprimir PDF',    icon: <PrinterOutlined />, onClick: () => imprimirPDFCierre(r) },
                    ...(puedeAnular ? [
                      { type: 'divider' as const },
                      { key: 'anular', label: 'Anular cierre', icon: <RollbackOutlined />, danger: true,
                        disabled: r.estado === 'anulada',
                        onClick: () => { setAnularTarget({ id: r.id, nombre: r.vendedorNombre ?? 'Administrador', fecha: r.fecha }); formAnular.resetFields(); } },
                    ] : []),
                  ]}
                />
              ),
            },
          ])} />
      </Card>

      {/* Drawer detalle de cierre */}
      <Drawer
        title={
          <Space>
            <LockOutlined />
            {`Cierre — ${detalleCierre?.vendedorNombre ?? 'Administrador'} · ${detalleCierre?.fecha ? fmt.date(detalleCierre.fecha) : ''}`}
          </Space>
        }
        open={!!detalleCierre}
        onClose={() => setDetalleCierre(null)}
        width="min(480px, 95vw)"
        footer={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => imprimirCierre(detalleCierre)}>Imprimir</Button>
            <Button icon={<PrinterOutlined />} onClick={() => imprimirPDFCierre(detalleCierre)}>Imprimir PDF</Button>
            {puedeAnular && detalleCierre?.estado !== 'anulada' && (
              <Button danger icon={<RollbackOutlined />}
                onClick={() => { setAnularTarget({ id: detalleCierre.id, nombre: detalleCierre.vendedorNombre ?? 'Administrador', fecha: detalleCierre.fecha }); setDetalleCierre(null); formAnular.resetFields(); }}>
                Anular
              </Button>
            )}
          </Space>
        }
      >
        {detalleCierre && (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Cajero" span={2}>
                <Text strong>{detalleCierre.vendedorNombre ?? 'Administrador'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Fecha">{fmt.date(detalleCierre.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={estadoColor[detalleCierre.estado] ?? 'default'}>{detalleCierre.estado?.toUpperCase()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Transacciones">{detalleCierre.cantidadTransacciones ?? 0}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '8px 0' }}>Ingresos del turno</Divider>
            <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
              <Descriptions.Item label="Ventas efectivo">{fmt.money(Number(detalleCierre.ventasEfectivo ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Ventas tarjeta">{fmt.money(Number(detalleCierre.ventasTarjeta ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Ventas transferencia">{fmt.money(Number(detalleCierre.ventasTransferencia ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Cobros recibidos">
                {fmt.money(Number(detalleCierre.cobrosRecibidos ?? 0))}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '8px 0' }}>Egresos</Divider>
            <Descriptions column={1} size="small" style={{ marginBottom: 8 }}>
              <Descriptions.Item label="Gastos registrados">{fmt.money(Number(detalleCierre.gastosEfectivo ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Retiros">{fmt.money(Number(detalleCierre.retiros ?? 0))}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '8px 0' }}>Cierre</Divider>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Apertura">{fmt.money(Number(detalleCierre.saldoApertura ?? 0))}</Descriptions.Item>
              <Descriptions.Item label="Efectivo esperado">
                <Text strong>{fmt.money(Number(detalleCierre.saldoCierre ?? 0))}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Efectivo contado">
                <Text strong>{fmt.money(Number(detalleCierre.saldoFisico ?? 0))}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Diferencia">
                <Text strong style={{
                  color: Number(detalleCierre.diferencia) === 0 ? token.colorSuccess
                       : Number(detalleCierre.diferencia) > 0 ? token.colorPrimary : token.colorError,
                  fontSize: 16,
                }}>
                  {Number(detalleCierre.diferencia) > 0 ? '+' : ''}{fmt.money(Number(detalleCierre.diferencia ?? 0))}
                  {Number(detalleCierre.diferencia) === 0 ? ' ✅' : Number(detalleCierre.diferencia) > 0 ? ' ↑ sobrante' : ' ↓ faltante'}
                </Text>
              </Descriptions.Item>
              {detalleCierre.notas && (
                <Descriptions.Item label="Notas" span={1}>{detalleCierre.notas}</Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>

      {/* Modal abrir caja */}
      <Modal
        title={<Space><UnlockOutlined style={{ color: '#10B981' }} />Abrir Caja</Space>}
        open={openAbrir} onCancel={() => setOpenAbrir(false)} footer={null} width="min(420px, 95vw)"
      >
        <Form form={form} layout="vertical" onFinish={v => abrirMut.mutate(v)}>
          <Form.Item name="vendedorId" label="Cajero responsable" rules={[{ required: true, message: 'Selecciona un cajero' }]}>
            <Select
              size="large"
              placeholder="Seleccionar cajero..."
              showSearch
              filterOption={(input: string, opt: any) =>
                (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={cajeros.map((u: any) => ({
                value: u.id,
                label: `${u.codigo ? u.codigo + ' — ' : ''}${u.nombre}`,
                sub:   u.email ?? '',
              }))}
              optionRender={(opt: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <Avatar size={22} style={{ background: avatarColor(opt.data.label as string), fontSize: 10, flexShrink: 0 }}>
                    {(opt.data.label as string)?.charAt(0).toUpperCase()}
                  </Avatar>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.data.label as string}</div>
                    <div style={{ fontSize: 11, color: token.colorTextTertiary }}>{opt.data.sub}</div>
                  </div>
                </div>
              )}
            />
          </Form.Item>
          <Form.Item name="saldoApertura" label="Saldo de apertura (RD$)">
            <InputNumber
              style={{ width: '100%' }} min={0} precision={2} size="large" autoFocus
              formatter={v => `RD$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v!.replace(/RD\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, marginTop: -12, marginBottom: 16 }}>
            Ingresa el efectivo inicial en la caja
          </div>
          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={2} placeholder="Ej: Billetes recibidos del banco, apertura especial..." />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenAbrir(false)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" icon={<UnlockOutlined />}
                loading={abrirMut.isPending}
                style={{ background: '#10B981', borderColor: '#10B981' }}>
                Abrir caja
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal cerrar caja — resumen completo + diferencia en tiempo real */}
      <Modal
        title={<Space><LockOutlined style={{ color: '#EF4444' }} />{`Cerrar caja — ${cerrarTarget?.nombre ?? ''}`}</Space>}
        open={!!cerrarTarget}
        onCancel={() => { setCerrarTarget(null); setSaldoFisicoInput(0); }}
        footer={null}
        width="min(460px, 95vw)"
      >
        {/* ── Resumen del turno ── */}
        <div style={{
          background: token.colorFillAlter,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: token.colorTextTertiary, marginBottom: 10,
          }}>
            Resumen del turno
          </div>

          {[
            { label: 'Ventas efectivo',      value: cerrarTarget?.ventasEfectivo ?? 0,      color: '#10B981' },
            { label: 'Ventas tarjeta',       value: cerrarTarget?.ventasTarjeta ?? 0,       color: undefined },
            { label: 'Ventas transferencia', value: cerrarTarget?.ventasTransferencia ?? 0, color: undefined },
            { label: 'Cobros recibidos',     value: cerrarTarget?.cobrosRecibidos ?? 0,     color: '#0EA5E9' },
            { label: 'Anticipos recibidos',  value: cerrarTarget?.totalAnticipos ?? 0,      color: '#7C3AED' },
            { label: 'Apertura (fondo)',     value: cerrarTarget?.saldoApertura ?? 0,       color: undefined },
            { label: 'Gastos registrados',   value: cerrarTarget?.gastosEfectivo ?? 0,      color: '#EF4444', signo: true },
            { label: 'Retiros',              value: cerrarTarget?.retiros ?? 0,             color: '#EF4444', signo: true },
          ].filter(item => item.value > 0).map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
              <span style={{ color: token.colorTextSecondary }}>{item.label}</span>
              <span style={{ fontWeight: 500, color: item.color ?? token.colorText }}>
                {item.signo ? '− ' : ''}{fmt.money(item.value)}
              </span>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${token.colorBorder}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>Efectivo esperado</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>{fmt.money(cerrarTarget?.saldoEsperado ?? 0)}</span>
          </div>
          <div style={{ fontSize: 11, color: token.colorTextTertiary, textAlign: 'center', marginTop: 6 }}>
            {cerrarTarget?.cantidadTransacciones ?? 0} transacciones · {cerrarTarget?.fecha ? fmt.date(cerrarTarget.fecha) : ''}
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={v => cerrarMut.mutate({ id: cerrarTarget!.id, body: v })}>
          <Form.Item
            name="saldoFisico"
            label={<span style={{ fontWeight: 500 }}>Efectivo físico contado (RD$)</span>}
            rules={[{ required: true, message: 'Ingresa el monto contado' }]}
          >
            <InputNumber
              style={{ width: '100%', fontSize: 16 }} size="large"
              min={0} precision={2} autoFocus placeholder="0.00"
              onChange={v => setSaldoFisicoInput(Number(v ?? 0))}
            />
          </Form.Item>

          {/* Diferencia en tiempo real */}
          {saldoFisicoInput > 0 && (() => {
            const difColor = diferenciaCierre === 0 ? token.colorSuccess : diferenciaCierre > 0 ? token.colorPrimary : token.colorError;
            const difBg    = diferenciaCierre === 0 ? token.colorSuccessBg : diferenciaCierre > 0 ? token.colorPrimaryBg : token.colorErrorBg;
            return (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 8, marginBottom: 16, marginTop: -8,
                background: difBg, border: `1px solid ${difColor}55`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: token.colorText }}>Diferencia</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: difColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {diferenciaCierre === 0 ? '✅' : diferenciaCierre > 0 ? '↑' : '↓'}
                  {' '}{fmt.money(Math.abs(diferenciaCierre))}
                  {diferenciaCierre === 0 ? ' Cuadrado' : diferenciaCierre > 0 ? ' Sobrante' : ' Faltante'}
                </span>
              </div>
            );
          })()}

          <Form.Item name="notas" label="Observaciones (opcional)">
            <Input.TextArea rows={2} placeholder="Ej: Billete roto de RD$500, cliente pagó con dólares..." />
          </Form.Item>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setCerrarTarget(null); setSaldoFisicoInput(0); }}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" danger htmlType="submit" icon={<LockOutlined />} loading={cerrarMut.isPending}>
                Confirmar cierre
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal anular cierre */}
      <Modal
        title={<Space><RollbackOutlined style={{ color: '#d97706' }} />{`Anular cierre — ${anularTarget?.nombre}`}</Space>}
        open={!!anularTarget}
        onCancel={() => { setAnularTarget(null); formAnular.resetFields(); }}
        footer={null} width="min(460px, 95vw)" destroyOnClose
      >
        <Alert type="warning" showIcon icon={<WarningOutlined />}
          message="¿Estás seguro de anular este cierre?"
          description={
            <span>
              La caja del <strong>{anularTarget?.fecha ? new Date(anularTarget.fecha + 'T00:00:00').toLocaleDateString('es-DO') : ''}</strong> de{' '}
              <strong>{anularTarget?.nombre}</strong> volverá a estado <strong>ABIERTA</strong>.
            </span>
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={formAnular} layout="vertical"
          onFinish={v => anularTarget && anularMut.mutate({ id: anularTarget.id, motivo: v.motivo })}>
          <Form.Item name="motivo" label="Motivo de la anulación"
            rules={[{ required: true, message: 'El motivo es obligatorio' }]}>
            <Input.TextArea rows={3} maxLength={300} placeholder="Ej: El cajero olvidó registrar ventas del turno de la tarde..." showCount />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setAnularTarget(null); formAnular.resetFields(); }}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" icon={<RollbackOutlined />}
                loading={anularMut.isPending} style={{ background: '#d97706', borderColor: '#d97706' }}>
                Confirmar anulación
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
