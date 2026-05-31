import { useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Table, Tag, Button,
         Space, DatePicker, Spin, Divider, Progress, Empty, Tabs } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt, estadoColor } from '../../utils/formatters';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const estadoCuentaApi = {
  get: (id: number, desde?: string, hasta?: string) => {
    const params = new URLSearchParams();
    if (desde) params.append('fechaDesde', desde);
    if (hasta) params.append('fechaHasta', hasta);
    return api.get(`/clientes/${id}/estado-cuenta?${params}`).then(r => r.data?.data ?? r.data);
  },
};

function fmtMon(v: number, moneda = 'DOP') {
  return fmt.moneyM(v, moneda);
}

export default function EstadoCuentaPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const [rango, setRango] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const desde = rango?.[0].format('YYYY-MM-DD');
  const hasta = rango?.[1].format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['estado-cuenta', id, desde, hasta],
    queryFn:  () => estadoCuentaApi.get(Number(id), desde, hasta),
    enabled:  !!id,
  });

  const handleExportar = () => {
    if (!data) return;
    const filas = data.facturas.map((f: any) => ({
      'Folio':    f.folio,
      'Fecha':    f.fecha,
      'Estado':   f.estado,
      'Moneda':   f.moneda ?? 'DOP',
      'Total':    fmtMon(f.total, f.moneda),
      'Pagado':   fmtMon(f.montoPagado, f.moneda),
      'Pendiente':fmtMon(f.montoPendiente, f.moneda),
    }));
    exportarExcel(filas, `Estado-Cuenta-${data.cliente?.nombre}-${dayjs().format('YYYY-MM-DD')}`);
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const resumenPorMoneda: Record<string, any> = data?.resumenPorMoneda ?? (data?.resumen ? { DOP: data.resumen } : {});
  const monedas = Object.keys(resumenPorMoneda);
  const hasMixed = monedas.length > 1;

  const facturaCols = [
    { title: 'Folio',    dataIndex: 'folio',    width: 130,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Fecha',    dataIndex: 'fecha',    width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Estado',   dataIndex: 'estado',   width: 100,
      render: (v: string) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
    { title: 'Moneda',   dataIndex: 'moneda',   width: 80,
      render: (v: string) => (
        <Tag color={v === 'USD' ? 'gold' : v === 'EUR' ? 'purple' : 'blue'}>{v ?? 'DOP'}</Tag>
      )},
    { title: 'Total',    dataIndex: 'total',    width: 120,
      render: (v: number, row: any) => fmtMon(v, row.moneda) },
    { title: 'Cobrado',  dataIndex: 'montoPagado', width: 120,
      render: (v: number, row: any) => fmtMon(v, row.moneda) },
    { title: 'Pendiente',dataIndex: 'montoPendiente', width: 120,
      render: (v: number, row: any) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>
          {fmtMon(v, row.moneda)}
        </Text>
      )},
  ];

  const cobroCols = [
    { title: 'Fecha',     dataIndex: 'fecha',      width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Método',    dataIndex: 'metodoPago', width: 120,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Moneda',    dataIndex: 'moneda',     width: 80,
      render: (v: string) => (
        <Tag color={v === 'USD' ? 'gold' : v === 'EUR' ? 'purple' : 'blue'}>{v ?? 'DOP'}</Tag>
      )},
    { title: 'Referencia',dataIndex: 'referencia', ellipsis: true },
    { title: 'Monto',     dataIndex: 'monto',      width: 120,
      render: (v: number, row: any) => (
        <Text strong style={{ color: '#059669' }}>{fmtMon(v, row.moneda)}</Text>
      )},
  ];

  const kpiCards = (m: string) => {
    const r = resumenPorMoneda[m] ?? {};
    return [
      { title: 'Total Facturado',   value: r.totalFacturado   ?? 0, color: '#1677ff',  moneda: m },
      { title: 'Total Cobrado',     value: r.totalCobrado     ?? 0, color: '#059669',  moneda: m },
      { title: 'Saldo Pendiente',   value: r.saldoPendiente   ?? 0, color: (r.saldoPendiente ?? 0) > 0 ? '#dc2626' : '#059669', moneda: m },
      { title: 'Facturas',          value: r.cantidadFacturas ?? 0, money: false },
    ];
  };

  const summaryRowForMoneda = (m: string) => {
    const r = resumenPorMoneda[m] ?? {};
    return (
      <Table.Summary.Row key={m}>
        <Table.Summary.Cell index={0} colSpan={4} align="right">
          <Text strong>Totales {m}:</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={1}>
          <Text strong>{fmtMon(r.totalFacturado ?? 0, m)}</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={2}>
          <Text strong style={{ color: '#059669' }}>{fmtMon(r.totalCobrado ?? 0, m)}</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={3}>
          <Text strong style={{ color: '#dc2626' }}>{fmtMon(r.saldoPendiente ?? 0, m)}</Text>
        </Table.Summary.Cell>
      </Table.Summary.Row>
    );
  };

  const kpiContent = (m: string) => (
    <Row gutter={[16, 16]}>
      {kpiCards(m).map((k, i) => (
        <Col xs={12} sm={6} key={k.title}>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card>
              <Statistic title={k.title} value={k.value}
                formatter={v => k.money === false ? v : fmtMon(Number(v), m)}
                valueStyle={{ color: k.color }} />
            </Card>
          </motion.div>
        </Col>
      ))}
    </Row>
  );

  return (
    <div>
      <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/clientes')}>
              Clientes
            </Button>
            <Title level={4} style={{ margin: 0 }}>
              Estado de Cuenta —{' '}
              <Text style={{ color: '#1677ff' }}>{data?.cliente?.nombre ?? '…'}</Text>
            </Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <RangePicker format="DD/MM/YYYY"
              onChange={v => setRango(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              placeholder={['Desde', 'Hasta']} />
            <Button icon={<DownloadOutlined />} onClick={handleExportar}>Excel</Button>
            <Button icon={<FilePdfOutlined />} type="primary" danger
              onClick={async () => {
                const eid   = localStorage.getItem('empresaId') ?? '';
                const params = new URLSearchParams();
                if (rango?.[0]) params.set('fechaDesde', rango[0].format('YYYY-MM-DD'));
                if (rango?.[1]) params.set('fechaHasta', rango[1].format('YYYY-MM-DD'));
                const res = await fetch(`/api/v1/clientes/${id}/estado-cuenta/pdf?${params}`, {
                  credentials: 'include',
                  headers: { 'X-Empresa-ID': eid },
                });
                if (!res.ok) { alert('Error generando PDF'); return; }
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `Estado-Cuenta-${data?.cliente?.nombre ?? id}.pdf`;
                a.click(); URL.revokeObjectURL(a.href);
              }}>
              Descargar PDF
            </Button>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir</Button>
          </Space>
        </Col>
      </Row>

      {!data ? (
        <Empty description="Sin datos" />
      ) : (
        <>
          {/* ── KPIs por moneda ── */}
          {hasMixed ? (
            <Tabs
              style={{ marginBottom: 20 }}
              items={monedas.map(m => ({
                key: m,
                label: m === 'USD' ? '🇺🇸 US$ Dólares' : m === 'EUR' ? '🇪🇺 € Euros' : '🇩🇴 RD$ Pesos',
                children: kpiContent(m),
              }))}
            />
          ) : (
            <div style={{ marginBottom: 20 }}>
              {kpiContent(monedas[0] ?? 'DOP')}
            </div>
          )}

          {/* ── Progreso de cobro por moneda ── */}
          <Card style={{ marginBottom: 16 }}>
            <Text strong>Porcentaje cobrado</Text>
            {monedas.map(m => {
              const r = resumenPorMoneda[m] ?? {};
              const pct = r.totalFacturado > 0 ? Math.round((r.totalCobrado / r.totalFacturado) * 100) : 0;
              return (
                <div key={m} style={{ marginTop: 8 }}>
                  {hasMixed && (
                    <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>{m}</Text>
                  )}
                  <Progress
                    percent={pct}
                    strokeColor={pct >= 90 ? '#059669' : pct >= 50 ? '#f59e0b' : '#dc2626'}
                    format={p => `${p}% (${fmtMon(r.totalCobrado ?? 0, m)} / ${fmtMon(r.totalFacturado ?? 0, m)})`}
                  />
                </div>
              );
            })}
          </Card>

          {/* ── Facturas ── */}
          <Card title="Historial de facturas" style={{ marginBottom: 16 }}>
            {(data.facturas ?? []).length === 0
              ? <Empty description="Sin facturas en el período" />
              : <Table
                  columns={facturaCols as any}
                  dataSource={data.facturas}
                  rowKey="folio"
                  size="small"
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary>
                      {monedas.map(m => summaryRowForMoneda(m))}
                    </Table.Summary>
                  )}
                />
            }
          </Card>

          <Divider />

          {/* ── Cobros ── */}
          <Card title="Cobros registrados">
            {(data.cobros ?? []).length === 0
              ? <Empty description="Sin cobros registrados en el período" />
              : <Table
                  columns={cobroCols as any}
                  dataSource={data.cobros}
                  rowKey={(_, i) => i!}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary>
                      {monedas.map(m => {
                        const cobrosMon = (data.cobros ?? []).filter((c: any) => (c.moneda ?? 'DOP') === m);
                        const totalCobM = cobrosMon.reduce((s: number, c: any) => s + Number(c.monto), 0);
                        return (
                          <Table.Summary.Row key={m}>
                            <Table.Summary.Cell index={0} colSpan={4} align="right">
                              <Text strong>Total cobrado {m}:</Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1}>
                              <Text strong style={{ color: '#059669' }}>{fmtMon(totalCobM, m)}</Text>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        );
                      })}
                    </Table.Summary>
                  )}
                />
            }
          </Card>
        </>
      )}
    </div>
  );
}
