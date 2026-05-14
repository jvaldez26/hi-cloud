import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Tabs, Progress, Alert, Divider, theme,
} from 'antd';
import {
  CreditCardOutlined, PlusOutlined, CheckCircleOutlined, CalculatorOutlined,
  WarningOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const ESTADO_PLAN: Record<string, { color: string; label: string }> = {
  vigente:    { color: 'blue',   label: 'Vigente'    },
  completado: { color: 'green',  label: 'Completado' },
  vencido:    { color: 'red',    label: 'Vencido'    },
  cancelado:  { color: 'default',label: 'Cancelado'  },
};

const ESTADO_CUOTA: Record<string, { color: string }> = {
  pendiente: { color: 'orange' }, pagada: { color: 'green' },
  vencida:   { color: 'red'    }, cancelada: { color: 'default' },
};

export default function CuotasPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalCrear, setModalCrear] = useState(false);
  const [planSel,    setPlanSel]    = useState<any>(null);
  const [formCrear]  = Form.useForm();
  const [simular, setSimular]       = useState({ capital: 100000, tasa: 3, cuotas: 12, resultado: null as any });

  const { data: resumen } = useQuery<any>({
    queryKey: ['cuotas-resumen'],
    queryFn:  () => api.get('/cuotas/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: planes = [] } = useQuery<any[]>({
    queryKey: ['planes-pago'],
    queryFn:  () => api.get('/cuotas').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: planDetalle } = useQuery<any>({
    queryKey: ['plan-detalle', planSel?.id],
    queryFn:  () => api.get(`/cuotas/${planSel.id}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  !!planSel?.id,
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/cuotas', dto),
    onSuccess: () => {
      // Invalidaciones separadas — una key combinada no matchea queries individuales
      qc.invalidateQueries({ queryKey: ['planes-pago'] });
      qc.invalidateQueries({ queryKey: ['cuotas-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      message.success('Plan de pago creado');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al crear plan'),
  });

  const pagarCuota = useMutation({
    mutationFn: (id: number) => api.patch(`/cuotas/cuota/${id}/pagar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-detalle', planSel?.id] });
      qc.invalidateQueries({ queryKey: ['planes-pago'] });
      qc.invalidateQueries({ queryKey: ['cuotas-resumen'] });
      message.success('Cuota pagada');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al registrar pago'),
  });

  const handleSimular = async () => {
    const r = await api.get(`/cuotas/simular?capital=${simular.capital}&tasa=${simular.tasa}&cuotas=${simular.cuotas}`);
    setSimular(prev => ({ ...prev, resultado: (r as any).data }));
  };

  const cuotasVencidas = (planDetalle?.cuotas ?? []).filter((c: any) => {
    return c.estado === 'pendiente' && c.fechaVencimiento < new Date().toISOString().split('T')[0];
  }).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditCardOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Cuotas & Planes de Pago</Title>
            <Text type="secondary">Financiamiento a plazos · Tabla de amortización automática · Control de pagos</Text>
          </div>
        </div>
        <Button icon={<FileExcelOutlined />} onClick={() => {
          const filas = planes.map((p: any) => ({
            'Cliente':   p.cliente?.nombre ?? p.clienteNombre ?? '',
            'Factura':   p.factura?.folio ?? p.facturaFolio ?? '',
            'Capital':   Number(p.capitalTotal ?? p.monto ?? 0),
            'Cuotas':    p.numeroCuotas ?? '',
            'Pagadas':   p.cuotasPagadas ?? 0,
            'Pendiente': Number(p.montoPendiente ?? 0),
            'Estado':    p.estado ?? '',
          }));
          exportarExcel(filas, `Cuotas-Planes-${dayjs().format('YYYY-MM-DD')}`);
          message.success(`${filas.length} planes exportados`);
        }}>Excel</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
          Nuevo Plan
        </Button>
      </div>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { label: 'Vigentes',    estado: 'vigente',    bg: 'linear-gradient(135deg,#1a56db,#3b82f6)' },
          { label: 'Completados', estado: 'completado', bg: 'linear-gradient(135deg,#059669,#10b981)' },
          { label: 'Cuotas Venc.', estado: null, bg: 'linear-gradient(135deg,#dc2626,#ef4444)', value: resumen?.cuotasVencidas ?? 0 },
        ].map(s => {
          const r = s.estado ? resumen?.planes?.find((p: any) => p.estado === s.estado) : null;
          return (
            <Col xs={12} sm={8} key={s.label}>
              <Card bordered={false} style={{ borderRadius: 12, background: s.bg }}>
                <Statistic title={<span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>{s.label}</span>}
                  value={s.value ?? r?.cantidad ?? 0}
                  suffix={r?.montoTotal > 0 ? <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}> · {fmt(r.montoTotal)}</Text> : ''}
                  valueStyle={{ color: '#fff', fontSize: 28 }} />
              </Card>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Lista de planes */}
        <Col xs={24} lg={planSel ? 10 : 24}>
          <Card bordered={false} style={{ borderRadius: 12 }} title="Planes de Pago">
            <Table dataSource={planes} rowKey="id" size="small" pagination={{ pageSize: 12 }}
              onRow={r => ({ style: { cursor: 'pointer' }, onClick: () => setPlanSel(r) })}
              columns={[
                { title: 'No.', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'mono', fontSize: 11 }}>{v}</Text> },
                { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', render: v => <Text strong>{v}</Text> },
                { title: 'Cuotas', key: 'cuotas', render: (_, r: any) => `${r.numeroCuotas} × ${fmt(r.montoCuota)}` },
                { title: 'Total', dataIndex: 'montoTotal', key: 'm', align: 'right', render: v => fmt(v) },
                { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={ESTADO_PLAN[v]?.color}>{ESTADO_PLAN[v]?.label}</Tag> },
              ]}
            />
          </Card>
        </Col>

        {/* Detalle del plan */}
        {planSel && planDetalle && (
          <Col xs={24} lg={14}>
            <Card bordered={false} style={{ borderRadius: 12 }}
              title={<Space>Plan {planDetalle.numero} <Tag color={ESTADO_PLAN[planDetalle.estado]?.color}>{ESTADO_PLAN[planDetalle.estado]?.label}</Tag></Space>}
              extra={<Button size="small" onClick={() => setPlanSel(null)}>✕</Button>}
            >
              {cuotasVencidas > 0 && (
                <Alert type="warning" showIcon icon={<WarningOutlined />}
                  message={`${cuotasVencidas} cuota(s) vencida(s) sin pagar`}
                  style={{ marginBottom: 12 }} />
              )}
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>Cliente</Text><div><Text strong>{planDetalle.clienteNombre}</Text></div></Col>
                <Col xs={24} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>Monto Total</Text><div><Text strong>{fmt(planDetalle.montoTotal)}</Text></div></Col>
                <Col xs={24} sm={8}><Text type="secondary" style={{ fontSize: 11 }}>Tasa Mensual</Text><div><Text strong>{planDetalle.tasaInteresMensual}%</Text></div></Col>
              </Row>
              <Table dataSource={planDetalle.cuotas} rowKey="id" size="small" pagination={false}
                scroll={{ y: 320 }}
                columns={[
                  { title: 'No.', dataIndex: 'numeroCuota', key: 'n', width: 40, render: v => `#${v}` },
                  { title: 'Vencimiento', dataIndex: 'fechaVencimiento', key: 'fv', width: 100 },
                  { title: 'Monto', dataIndex: 'monto', key: 'm', align: 'right', render: v => fmt(v) },
                  {
                    title: 'Estado', dataIndex: 'estado', key: 'e',
                    render: v => <Tag color={ESTADO_CUOTA[v]?.color}>{v.toUpperCase()}</Tag>,
                  },
                  { title: 'Pagado', dataIndex: 'fechaPago', key: 'fp', render: v => v ?? '—' },
                  {
                    title: '', key: 'acc',
                    render: (_, r: any) => r.estado === 'pendiente' ? (
                      <Popconfirm title="¿Registrar pago?" onConfirm={() => pagarCuota.mutate(r.id)}>
                        <Button size="small" icon={<CheckCircleOutlined />}
                          style={{ color: token.colorSuccess, borderColor: token.colorSuccess }}>
                          Pagar
                        </Button>
                      </Popconfirm>
                    ) : null,
                  },
                ]}
              />
            </Card>
          </Col>
        )}

        {/* Simulador */}
        <Col xs={24} lg={planSel ? 24 : 10}>
          <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><CalculatorOutlined />Simulador de Cuotas</Space>}>
            <Row gutter={8} align="bottom">
              <Col xs={24} sm={7}>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Capital (RD$)</Text>
                <InputNumber style={{ width: '100%' }} value={simular.capital} min={1}
                  onChange={v => setSimular(p => ({ ...p, capital: Number(v), resultado: null }))} />
              </Col>
              <Col xs={24} sm={7}>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Tasa mensual (%)</Text>
                <InputNumber style={{ width: '100%' }} value={simular.tasa} min={0} step={0.5} precision={2}
                  onChange={v => setSimular(p => ({ ...p, tasa: Number(v), resultado: null }))} />
              </Col>
              <Col xs={12} sm={6}>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Cuotas</Text>
                <InputNumber style={{ width: '100%' }} value={simular.cuotas} min={1} max={120}
                  onChange={v => setSimular(p => ({ ...p, cuotas: Number(v), resultado: null }))} />
              </Col>
              <Col xs={12} sm={4}>
                <Button type="primary" block onClick={handleSimular}>Simular</Button>
              </Col>
            </Row>
            {simular.resultado && (
              <div style={{ marginTop: 16, padding: 12, background: token.colorFillAlter, borderRadius: 8 }}>
                <Row gutter={16}>
                  {[
                    { label: 'Cuota mensual',    value: fmt(simular.resultado.montoCuota) },
                    { label: 'Total a pagar',    value: fmt(simular.resultado.totalPagar) },
                    { label: 'Total intereses',  value: fmt(simular.resultado.totalInteres) },
                  ].map(s => (
                    <Col span={8} key={s.label} style={{ textAlign: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{s.label}</Text>
                      <Text strong style={{ fontSize: 16 }}>{s.value}</Text>
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Modal Crear Plan */}
      <Modal title="Nuevo Plan de Pago" open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()} confirmLoading={crear.isPending}
        okText="Crear Plan" width={540} destroyOnClose>
        <Form form={formCrear} layout="vertical"
          initialValues={{ fechaInicio: dayjs(), numeroCuotas: 12, tasaInteresMensual: 0 }}
          onFinish={v => crear.mutate({ ...v, fechaInicio: v.fechaInicio?.format('YYYY-MM-DD') })}>
          <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children">
              {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="montoTotal" label="Monto Total (RD$)" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} prefix="RD$" size="large" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="montoInicial" label="Cuota Inicial (RD$, opcional)"><InputNumber min={0} style={{ width: '100%' }} prefix="RD$" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="numeroCuotas" label="N° Cuotas"><InputNumber min={1} max={120} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tasaInteresMensual" label="Tasa Mensual (%)"><InputNumber min={0} step={0.5} precision={2} style={{ width: '100%' }} addonAfter="%" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fechaInicio" label="1ra Cuota en"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          </Row>
          <Form.Item name="facturaFolio" label="Factura de referencia (opcional)"><Input placeholder="FAC-202505-0001" /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
