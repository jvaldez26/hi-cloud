import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, theme,
} from 'antd';
import {
  BankOutlined, PlusOutlined, DeleteOutlined, DollarOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const TIPOS = [
  { value: 'efectivo',      label: '💵 Efectivo',        color: 'green'  },
  { value: 'cheque',        label: '📄 Cheque',           color: 'blue'   },
  { value: 'transferencia', label: '🏦 Transferencia',    color: 'purple' },
  { value: 'pago_tarjeta',  label: '💳 Pago con Tarjeta', color: 'cyan'   },
  { value: 'otro',          label: '📦 Otro',             color: 'default'},
];

export default function DepositosPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalCrear, setModalCrear] = useState(false);
  const [cuentaFiltro, setCuentaFiltro] = useState<number | undefined>();
  const [form] = Form.useForm();

  const { data: cuentas = [] } = useQuery<any[]>({
    queryKey: ['cuentas-bancarias'],
    queryFn: () => api.get('/bancos/cuentas').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: resumen } = useQuery<any>({
    queryKey: ['depositos-resumen'],
    queryFn: () => api.get('/depositos/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: depositos, isLoading } = useQuery<any>({
    queryKey: ['depositos', cuentaFiltro],
    queryFn: () => api.get(`/depositos?limit=50${cuentaFiltro ? `&cuentaId=${cuentaFiltro}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/depositos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['depositos'] });
      qc.invalidateQueries({ queryKey: ['depositos-resumen'] });
      qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] });
      setModalCrear(false);
      form.resetFields();
      message.success('Depósito registrado y saldo actualizado');
    },
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/depositos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['depositos'] });
      qc.invalidateQueries({ queryKey: ['depositos-resumen'] });
      qc.invalidateQueries({ queryKey: ['cuentas-bancarias'] });
      message.success('Depósito eliminado y saldo revertido');
    },
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BankOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Depósitos Bancarios</Title>
            <Text type="secondary">Registro de ingresos a cuentas · Actualización automática de saldos</Text>
          </div>
        </div>
        <Space>
          <Select
            allowClear
            placeholder="Filtrar por cuenta"
            style={{ width: 200 }}
            value={cuentaFiltro}
            onChange={setCuentaFiltro}
          >
            {cuentas.map((c: any) => (
              <Option key={c.id} value={c.id}>{c.banco} — {c.nombre}</Option>
            ))}
          </Select>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (depositos?.data ?? []).map((d: any) => ({
              'Fecha':        d.fecha ? dayjs(d.fecha).format('DD/MM/YYYY') : '',
              'Cuenta':       d.cuenta?.banco ?? d.cuentaBancaria ?? '',
              'Concepto':     d.concepto ?? '',
              'Referencia':   d.referencia ?? '',
              'Monto':        Number(d.monto ?? 0),
              'Estado':       d.estado ?? '',
            }));
            exportarExcel(filas, `Depositos-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Depósito
          </Button>
        </Space>
      </div>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Depositado</span>}
              value={resumen?.totalGeneral ?? 0}
              formatter={v => fmt(Number(v))}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#fff', fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Depósitos</span>}
              value={resumen?.cantidadTotal ?? 0}
              prefix={<BankOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Por tipo</Text>
            {(resumen?.porTipo ?? []).map((t: any) => {
              const conf = TIPOS.find(x => x.value === t.tipo);
              return (
                <div key={t.tipo} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Tag color={conf?.color} style={{ fontSize: 11 }}>{conf?.label ?? t.tipo}</Tag>
                  <Text style={{ fontSize: 12 }}>{fmt(t.total)}</Text>
                </div>
              );
            })}
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={depositos?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={[
            { title: 'Número', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
            {
              title: 'Tipo', dataIndex: 'tipo', key: 't',
              render: v => {
                const conf = TIPOS.find(x => x.value === v);
                return <Tag color={conf?.color}>{conf?.label ?? v}</Tag>;
              },
            },
            {
              title: 'Depositante', key: 'd',
              render: (_, r: any) => r.nombreDepositante ?? <Text type="secondary">—</Text>,
            },
            {
              title: 'Descripción', dataIndex: 'descripcion', key: 'desc',
              render: v => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '—',
            },
            {
              title: 'Referencia', dataIndex: 'referencia', key: 'ref',
              render: v => v ? <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</Tag> : '—',
            },
            {
              title: 'Monto', dataIndex: 'monto', key: 'm', align: 'right',
              render: v => <Text strong style={{ color: token.colorSuccess, fontSize: 14 }}>{fmt(v)}</Text>,
            },
            {
              title: '', key: 'acc',
              render: (_, r: any) => (
                <Popconfirm
                  title="¿Eliminar depósito?"
                  description="El saldo de la cuenta será revertido."
                  onConfirm={() => eliminar.mutate(r.id)}
                >
                  <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal */}
      <Modal
        title={<Space><BankOutlined />Nuevo Depósito Bancario</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={crear.isPending}
        okText="Registrar Depósito"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical"
          initialValues={{ fecha: dayjs(), tipo: 'efectivo' }}
          onFinish={v => crear.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD'), monto: Number(v.monto) })}>
          <Form.Item name="cuentaId" label="Cuenta Bancaria" rules={[{ required: true }]}>
            <Select placeholder="Seleccionar cuenta">
              {cuentas.map((c: any) => (
                <Option key={c.id} value={c.id}>
                  {c.banco} — {c.nombre} ({fmt(c.saldoInicial)})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha" label="Fecha del depósito" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tipo" label="Tipo de depósito" rules={[{ required: true }]}>
                <Select>
                  {TIPOS.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="RD$" size="large" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="referencia" label="Referencia / Número">
                <Input placeholder="CHQ-001, TRF-2026..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nombreDepositante" label="Depositante">
                <Input placeholder="Nombre del cliente o empresa" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción">
            <Input placeholder="Pago de factura, abono, etc." />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
