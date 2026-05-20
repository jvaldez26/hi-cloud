import { useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Table, Tag, Button,
         Space, DatePicker, Spin, Divider, Progress, Empty } from 'antd';
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
      'Folio':           f.folio,
      'Fecha':           f.fecha,
      'Estado':          f.estado,
      'Total':           f.total,
      'Pagado':          f.montoPagado,
      'Pendiente':       f.montoPendiente,
    }));
    exportarExcel(filas, `Estado-Cuenta-${data.cliente?.nombre}-${dayjs().format('YYYY-MM-DD')}`);
  };

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;

  const resumen = data?.resumen;
  const pctCobrado = resumen?.totalFacturado > 0
    ? Math.round((resumen.totalCobrado / resumen.totalFacturado) * 100)
    : 0;

  const facturaCols = [
    { title: 'Folio',      dataIndex: 'folio',           width: 150,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Fecha',      dataIndex: 'fecha',           width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Estado',     dataIndex: 'estado',          width: 100,
      render: (v: string) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
    { title: 'Total',      dataIndex: 'total',           width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Cobrado',    dataIndex: 'montoPagado',     width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Pendiente',  dataIndex: 'montoPendiente',  width: 120,
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#dc2626' : '#059669' }}>
          {fmt.money(v)}
        </Text>
      )},
  ];

  const cobroCols = [
    { title: 'Fecha',      dataIndex: 'fecha',      width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Método',     dataIndex: 'metodoPago', width: 120,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Referencia', dataIndex: 'referencia', ellipsis: true },
    { title: 'Monto',      dataIndex: 'monto',      width: 120,
      render: (v: number) => <Text strong style={{ color: '#059669' }}>{fmt.money(v)}</Text> },
  ];

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
          {/* ── KPIs ── */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {[
              { title: 'Total Facturado',   value: resumen?.totalFacturado,   color: '#1677ff' },
              { title: 'Total Cobrado',     value: resumen?.totalCobrado,     color: '#059669' },
              { title: 'Saldo Pendiente',   value: resumen?.saldoPendiente,   color: resumen?.saldoPendiente > 0 ? '#dc2626' : '#059669' },
              { title: 'Facturas',          value: resumen?.cantidadFacturas, money: false },
            ].map((k, i) => (
              <Col xs={12} sm={6} key={k.title}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card>
                    <Statistic title={k.title} value={k.value ?? 0}
                      formatter={v => k.money === false ? v : fmt.money(Number(v))}
                      valueStyle={{ color: k.color }} />
                  </Card>
                </motion.div>
              </Col>
            ))}
          </Row>

          {/* ── Progreso de cobro ── */}
          <Card style={{ marginBottom: 16 }}>
            <Text strong>Porcentaje cobrado</Text>
            <Progress
              percent={pctCobrado}
              strokeColor={pctCobrado >= 90 ? '#059669' : pctCobrado >= 50 ? '#f59e0b' : '#dc2626'}
              style={{ marginTop: 8 }}
              format={p => `${p}% (${fmt.money(resumen?.totalCobrado ?? 0)} / ${fmt.money(resumen?.totalFacturado ?? 0)})`}
            />
          </Card>

          {/* ── Facturas ── */}
          <Card title="Historial de facturas" style={{ marginBottom: 16 }}>
            {data.facturas.length === 0
              ? <Empty description="Sin facturas en el período" />
              : <Table columns={facturaCols} dataSource={data.facturas} rowKey="folio"
                  size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3} align="right">
                          <Text strong>Totales:</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text strong>{fmt.money(resumen?.totalFacturado ?? 0)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          <Text strong style={{ color: '#059669' }}>{fmt.money(resumen?.totalCobrado ?? 0)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          <Text strong style={{ color: '#dc2626' }}>{fmt.money(resumen?.saldoPendiente ?? 0)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )} />
            }
          </Card>

          {/* ── Cobros ── */}
          <Card title="Cobros registrados">
            {data.cobros.length === 0
              ? <Empty description="Sin cobros registrados en el período" />
              : <Table columns={cobroCols} dataSource={data.cobros} rowKey={(_, i) => i!}
                  size="small" pagination={{ pageSize: 10, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={3} align="right">
                        <Text strong>Total cobrado:</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1}>
                        <Text strong style={{ color: '#059669' }}>
                          {fmt.money(resumen?.totalCobrado ?? 0)}
                        </Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )} 
        scroll={{ x: 'max-content' }} />
            }
          </Card>
        </>
      )}
    </div>
  );
}
