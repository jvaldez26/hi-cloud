import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  InputNumber, Space, Typography, Statistic, message, theme,
  Divider,
} from 'antd';
import {
  DollarOutlined, PlusOutlined, RetweetOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const MONEDA_FLAG: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CAD: '🇨🇦', JPY: '🇯🇵', CNY: '🇨🇳',
};

const MONEDA_COLOR: Record<string, string> = {
  USD: '#1a56db', EUR: '#4f46e5', GBP: '#6d28d9', CAD: '#dc2626', JPY: '#dc2626', CNY: '#dc2626',
};

export default function DivisasPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalNueva, setModalNueva] = useState(false);
  const [monedaHistorial, setMonedaHistorial] = useState('USD');
  const [formNueva] = Form.useForm();

  const { data: tasasHoy = [] } = useQuery<any[]>({
    queryKey: ['tasas-hoy'],
    queryFn:  () => api.get('/divisas/tasas-hoy').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: historial = [] } = useQuery<any[]>({
    queryKey: ['tasa-historial', monedaHistorial],
    queryFn:  () => api.get(`/divisas/historial/${monedaHistorial}?limite=30`).then((r: any) => r.data?.data ?? r.data),
  });

  const { data: monedas = [] } = useQuery<any[]>({
    queryKey: ['monedas'],
    queryFn:  () => api.get('/divisas/monedas').then((r: any) => r.data?.data ?? r.data),
  });

  const [convertiendo, setConvertiendo] = useState({ monto: 1000, moneda: 'USD', resultado: null as any });

  const registrar = useMutation({
    mutationFn: (dto: any) => api.post('/divisas/tasa', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasas-hoy'] });
      qc.invalidateQueries({ queryKey: ['tasa-historial'] });
      setModalNueva(false);
      formNueva.resetFields();
      message.success('Tasa registrada');
    },
  });

  const convertir = async () => {
    try {
      const r = await api.get(`/divisas/convertir?monto=${convertiendo.monto}&moneda=${convertiendo.moneda}&tipo=venta`);
      setConvertiendo(prev => ({ ...prev, resultado: (r as any).data }));
    } catch { message.error('Sin tasa disponible para esta moneda'); }
  };

  const historialChart = historial.slice().reverse().map((h: any) => ({
    fecha:    h.fecha,
    venta:    Number(h.tasaVenta),
    compra:   Number(h.tasaCompra),
  }));

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DollarOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Divisas & Tasas de Cambio</Title>
            <Text type="secondary">Gestión de monedas extranjeras · Conversión en tiempo real a DOP</Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalNueva(true)}>
          Registrar Tasa
        </Button>
      </div>

      {/* Tasas actuales */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {tasasHoy.map((t: any) => (
          <Col xs={12} sm={6} key={t.moneda}>
            <Card
              bordered={false}
              style={{
                borderRadius: 12,
                background: `linear-gradient(135deg,${MONEDA_COLOR[t.moneda] ?? '#1a56db'},${MONEDA_COLOR[t.moneda] ?? '#3b82f6'}cc)`,
                cursor: 'pointer',
              }}
              onClick={() => setMonedaHistorial(t.moneda)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>
                    {MONEDA_FLAG[t.moneda]} {t.moneda}
                  </Text>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                    {Number(t.tasaVenta).toFixed(2)}
                  </div>
                  <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>
                    Compra: {Number(t.tasaCompra).toFixed(2)}
                  </Text>
                </div>
                <Tag style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', fontSize: 10 }}>
                  {t.fecha}
                </Tag>
              </div>
              <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 10, display: 'block', marginTop: 4 }}>
                {t.nombreMoneda}
              </Text>
            </Card>
          </Col>
        ))}
        {tasasHoy.length === 0 && (
          <Col span={24}>
            <Card bordered={false} style={{ borderRadius: 12, textAlign: 'center', padding: 32 }}>
              <DollarOutlined style={{ fontSize: 48, color: token.colorTextDisabled, marginBottom: 12 }} />
              <div><Text type="secondary">No hay tasas registradas. Registra la primera tasa del día.</Text></div>
            </Card>
          </Col>
        )}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Historial */}
        <Col xs={24} lg={16}>
          <Card
            bordered={false}
            style={{ borderRadius: 12 }}
            title={
              <Space>
                <BarChartOutlined />
                Historial de Tasas
                <Select value={monedaHistorial} onChange={setMonedaHistorial} size="small" style={{ width: 80 }}>
                  {['USD','EUR','GBP','CAD'].map(m => <Option key={m} value={m}>{MONEDA_FLAG[m]} {m}</Option>)}
                </Select>
              </Space>
            }
          >
            {historialChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={historialChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => [`RD$ ${v.toFixed(2)}`, '']} />
                  <Line type="monotone" dataKey="venta"  stroke="#1a56db" strokeWidth={2} dot={false} name="Venta" />
                  <Line type="monotone" dataKey="compra" stroke="#059669" strokeWidth={2} dot={false} name="Compra" strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Text type="secondary">Sin historial para {monedaHistorial}</Text>
            )}
            <Table
              dataSource={historial.slice(0, 10)}
              rowKey="id"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              columns={[
                { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
                { title: 'Venta (RD$)', dataIndex: 'tasaVenta', key: 'v', align: 'right', render: v => <Text strong style={{ color: token.colorPrimary }}>{Number(v).toFixed(4)}</Text> },
                { title: 'Compra (RD$)', dataIndex: 'tasaCompra', key: 'c', align: 'right', render: v => <Text style={{ color: token.colorSuccess }}>{Number(v).toFixed(4)}</Text> },
                { title: 'Fuente', dataIndex: 'fuente', key: 's', render: v => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
              ]}
            />
          </Card>
        </Col>

        {/* Conversor */}
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><RetweetOutlined />Conversor de Divisas</Space>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Monto</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  value={convertiendo.monto}
                  min={0.01}
                  onChange={v => setConvertiendo(prev => ({ ...prev, monto: Number(v), resultado: null }))}
                  prefix={MONEDA_FLAG[convertiendo.moneda]}
                  size="large"
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Moneda</Text>
                <Select
                  value={convertiendo.moneda}
                  onChange={m => setConvertiendo(prev => ({ ...prev, moneda: m, resultado: null }))}
                  style={{ width: '100%' }}
                  size="large"
                >
                  {monedas.map((m: any) => <Option key={m.codigo} value={m.codigo}>{MONEDA_FLAG[m.codigo]} {m.codigo} — {m.nombre}</Option>)}
                </Select>
              </div>
              <Button type="primary" size="large" block icon={<RetweetOutlined />} onClick={convertir}>
                Convertir a DOP
              </Button>
              {convertiendo.resultado && (
                <div style={{
                  background:   token.colorSuccessBg,
                  border:       `1px solid ${token.colorSuccessBorder}`,
                  borderRadius: 8, padding: 16, textAlign: 'center',
                }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {convertiendo.monto.toLocaleString('es-DO')} {convertiendo.moneda} =
                  </Text>
                  <div style={{ fontSize: 28, fontWeight: 800, color: token.colorSuccess }}>
                    RD$ {Number(convertiendo.resultado.montoDOP).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Tasa: RD$ {convertiendo.resultado.tasa} · {convertiendo.resultado.fecha}
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Modal Registrar Tasa */}
      <Modal
        title={<Space><DollarOutlined />Registrar Tasa de Cambio</Space>}
        open={modalNueva}
        onCancel={() => { setModalNueva(false); formNueva.resetFields(); }}
        onOk={() => formNueva.submit()}
        confirmLoading={registrar.isPending}
        okText="Registrar"
        destroyOnClose
      >
        <Form form={formNueva} layout="vertical"
          initialValues={{ moneda: 'USD', fecha: dayjs().format('YYYY-MM-DD'), fuente: 'Banco Central RD' }}
          onFinish={v => registrar.mutate(v)}>
          <Form.Item name="moneda" label="Moneda" rules={[{ required: true }]}>
            <Select>
              {monedas.map((m: any) => <Option key={m.codigo} value={m.codigo}>{MONEDA_FLAG[m.codigo]} {m.codigo} — {m.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="tasaVenta" label="Tasa Venta (RD$)" rules={[{ required: true }]}>
                <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="60.50" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tasaCompra" label="Tasa Compra (RD$)" rules={[{ required: true }]}>
                <InputNumber min={0.0001} precision={4} style={{ width: '100%' }} placeholder="60.10" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha" label="Fecha"><Input type="date" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fuente" label="Fuente">
                <Select>
                  {['Banco Central RD','Banreservas','Popular','BHD León','Manual'].map(f => <Option key={f} value={f}>{f}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          💡 Las tasas del Banco Central RD se publican diariamente en <strong>bancentral.gov.do</strong>
        </Text>
      </Modal>
    </div>
  );
}
