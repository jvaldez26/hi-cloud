import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import {
  Card, Row, Col, Statistic, Button, Table, Tag, Modal, Form,
  Input, InputNumber, Select, DatePicker, Space, Tabs, Popconfirm,
  message, Typography, Divider, theme,
} from 'antd';
import {
  CreditCardOutlined, PlusOutlined, CheckCircleOutlined, FileExcelOutlined,
  SyncOutlined, DollarOutlined, BankOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(v ?? 0);

const BANCOS_DR = ['Banreservas', 'Popular', 'BHD León', 'Scotiabank', 'Apap', 'Promerica', 'Banco López de Haro', 'Otro'];

export default function DatafonoPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [tabActiva, setTabActiva] = useState('terminales');
  const [modalTerminal, setModalTerminal] = useState(false);
  const [modalTransaccion, setModalTransaccion] = useState(false);
  const [modalConciliacion, setModalConciliacion] = useState(false);
  const [formTerminal] = Form.useForm();
  const [formTransaccion] = Form.useForm();
  const [formConciliacion] = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['datafono-resumen'],
    queryFn: () => api.get('/datafono/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: terminales = [] } = useQuery<any[]>({
    queryKey: ['terminales'],
    queryFn: () => api.get('/datafono/terminales').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: transacciones = [] } = useQuery<any[]>({
    queryKey: ['transacciones-tarjeta'],
    queryFn: () => api.get('/datafono/transacciones').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const { data: conciliaciones = [] } = useQuery<any[]>({
    queryKey: ['conciliaciones-datafono'],
    queryFn: () => api.get('/datafono/conciliaciones').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const crearTerminal = useMutation({
    mutationFn: (data: any) => api.post('/datafono/terminales', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['terminales'] }); setModalTerminal(false); formTerminal.resetFields(); message.success('Terminal registrada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const crearTransaccion = useMutation({
    mutationFn: (data: any) => api.post('/datafono/transacciones', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transacciones-tarjeta'] });
      qc.invalidateQueries({ queryKey: ['datafono-resumen'] }); setModalTransaccion(false); formTransaccion.resetFields(); message.success('Transacción registrada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const crearConciliacion = useMutation({
    mutationFn: (data: any) => api.post('/datafono/conciliaciones', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conciliaciones-datafono'] });
      qc.invalidateQueries({ queryKey: ['transacciones-tarjeta'] });
      qc.invalidateQueries({ queryKey: ['datafono-resumen'] }); setModalConciliacion(false); formConciliacion.resetFields(); message.success('Conciliación creada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const confirmarConc = useMutation({
    mutationFn: (id: number) => api.patch(`/datafono/conciliaciones/${id}/confirmar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conciliaciones-datafono'] }); message.success('Conciliación confirmada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const estadoColor: Record<string, string> = {
    pendiente: 'orange', conciliado: 'green', discrepancia: 'red',
    borrador: 'default', confirmada: 'blue', cerrada: 'purple',
  };

  const terminalesFiltradas = useMemo(() =>
    (terminales ?? []).filter(i =>
      String(i.numeroTerminal ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.banco ?? '').toLowerCase().includes(search.toLowerCase())
    ), [terminales, search]);

  const transaccionesFiltradas = useMemo(() =>
    (transacciones ?? []).filter(i =>
      String(i.referencia ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.tarjetaUltimos4 ?? '').toLowerCase().includes(search.toLowerCase())
    ), [transacciones, search]);

  const conciliacionesFiltradas = useMemo(() =>
    (conciliaciones ?? []).filter(i =>
      String(i.fechaDesde ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.estado ?? '').toLowerCase().includes(search.toLowerCase())
    ), [conciliaciones, search]);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditCardOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>DataFono / Tarjetas</Title>
            <Text type="secondary">Conciliación de terminales Visanet · CardNet · AMEX</Text>
          </div>
        </div>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tabActiva}
          onChange={setTabActiva}
          tabBarExtraContent={
            <Space>
              <Input
                placeholder="Buscar por referencia o tarjeta..."
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                value={search}
                onChange={e => { setSearch(e.target.value); }}
                allowClear
                style={{ width: 220 }}
              />
              <Button icon={<FileExcelOutlined />} size="small" onClick={() => {
                const src = tabActiva === 'terminales' ? terminales : transacciones;
                const filas = (src ?? []).map((r: any) => ({
                  'Terminal':  r.numeroTerminal ?? r.terminal?.numeroTerminal ?? '',
                  'Banco':     r.banco ?? r.terminal?.banco ?? '',
                  'Fecha':     r.fecha ?? '',
                  'Monto':     Number(r.monto ?? 0),
                  'Estado':    r.estado ?? (r.activo ? 'Activo' : 'Inactivo'),
                }));
                exportarExcel(filas, `Datafono-${tabActiva}`);
              }}>Excel</Button>
            <RefreshByKeyButton queryKey={['datafono']} />
            <VideoTutorialButton />
              {tabActiva === 'terminales' && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalTerminal(true)}>
                  Terminal
                </Button>
              )}
              {tabActiva === 'transacciones' && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalTransaccion(true)}>
                  Transacción
                </Button>
              )}
              {tabActiva === 'conciliaciones' && (
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setModalConciliacion(true)}>
                  Nueva Conciliación
                </Button>
              )}
            </Space>
          }
          items={[
            {
              key: 'terminales',
              label: 'Terminales',
              children: (
                <Table
                  dataSource={terminalesFiltradas}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'No. Terminal', dataIndex: 'numeroTerminal', key: 'numeroTerminal', render: v => <Text strong>{v}</Text> },
                    { title: 'Banco', dataIndex: 'banco', key: 'banco' },
                    { title: 'Tarjeta', dataIndex: 'tipoTarjeta', key: 'tipoTarjeta', render: v => <Tag>{v.toUpperCase()}</Tag> },
                    { title: 'Sucursal', dataIndex: 'sucursal', key: 'sucursal', render: v => v || '—' },
                    { title: 'Comisión %', dataIndex: 'comisionPct', key: 'comisionPct', render: v => `${v}%` },
                    { title: 'Estado', dataIndex: 'activo', key: 'activo', render: v => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'transacciones',
              label: 'Transacciones',
              children: (
                <Table
                  dataSource={transaccionesFiltradas}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', sorter: (a, b) => a.fecha.localeCompare(b.fecha) },
                    { title: 'Referencia', dataIndex: 'referencia', key: 'referencia' },
                    { title: 'Tipo', dataIndex: 'tipo', key: 'tipo', render: v => <Tag color={v === 'venta' ? 'green' : 'red'}>{v.toUpperCase()}</Tag> },
                    { title: 'Monto', dataIndex: 'monto', key: 'monto', align: 'right', render: v => fmt(v), sorter: (a, b) => a.monto - b.monto },
                    { title: 'Comisión', dataIndex: 'comision', key: 'comision', align: 'right', render: v => fmt(v) },
                    { title: 'Neto', dataIndex: 'neto', key: 'neto', align: 'right', render: v => <Text strong style={{ color: '#059669' }}>{fmt(v)}</Text> },
                    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: v => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'conciliaciones',
              label: 'Conciliaciones',
              children: (
                <Table
                  dataSource={conciliacionesFiltradas}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: 'Período', key: 'periodo', render: (_, r: any) => `${r.fechaDesde} → ${r.fechaHasta}` },
                    { title: 'Transacciones', dataIndex: 'cantidadTransacciones', key: 'cantidadTransacciones', align: 'center' },
                    { title: 'Total Bruto', dataIndex: 'totalBruto', key: 'totalBruto', align: 'right', render: v => fmt(v) },
                    { title: 'Comisiones', dataIndex: 'totalComisiones', key: 'totalComisiones', align: 'right', render: v => <Text type="danger">-{fmt(v)}</Text> },
                    { title: 'Neto Banco', dataIndex: 'totalNeto', key: 'totalNeto', align: 'right', render: v => <Text strong style={{ color: '#059669' }}>{fmt(v)}</Text> },
                    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: v => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
                    {
                      title: 'Acciones', key: 'acc',
                      render: (_, r: any) => r.estado === 'borrador' ? (
                        <Popconfirm title="¿Confirmar esta conciliación?" onConfirm={() => confirmarConc.mutate(r.id)}>
                          <Button size="small" type="primary">Confirmar</Button>
                        </Popconfirm>
                      ) : null,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Terminal */}
      <Modal
        title="Registrar Terminal DataFono"
        open={modalTerminal}
        onCancel={() => setModalTerminal(false)}
        onOk={() => formTerminal.submit()}
        confirmLoading={crearTerminal.isPending}
        okText="Guardar"
      >
        <Form form={formTerminal} layout="vertical" onFinish={v => crearTerminal.mutate(v)}>
          <Form.Item name="banco" label="Banco" rules={[{ required: true }]}>
            <Select placeholder="Selecciona banco">
              {BANCOS_DR.map(b => <Option key={b} value={b}>{b}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="numeroTerminal" label="No. Terminal" rules={[{ required: true }]}>
            <Input placeholder="Ej. 12345678" />
          </Form.Item>
          <Form.Item name="tipoTarjeta" label="Tipo Tarjeta" initialValue="all">
            <Select>
              <Option value="all">Todas</Option>
              <Option value="visa">VISA</Option>
              <Option value="mastercard">Mastercard</Option>
              <Option value="amex">AMEX</Option>
            </Select>
          </Form.Item>
          <Form.Item name="sucursal" label="Sucursal / Punto de Venta">
            <Input placeholder="Ej. Tienda Principal" />
          </Form.Item>
          <Form.Item name="comisionPct" label="Comisión %" initialValue={3.5} rules={[{ required: true }]}>
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Transacción */}
      <Modal
        title="Registrar Transacción"
        open={modalTransaccion}
        onCancel={() => setModalTransaccion(false)}
        onOk={() => formTransaccion.submit()}
        confirmLoading={crearTransaccion.isPending}
        okText="Guardar"
      >
        <Form form={formTransaccion} layout="vertical" onFinish={v => crearTransaccion.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD') })}>
          <Form.Item name="terminalId" label="Terminal" rules={[{ required: true }]}>
            <Select placeholder="Selecciona terminal">
              {terminales.map((t: any) => (
                <Option key={t.id} value={t.id}>{t.banco} — {t.numeroTerminal}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="referencia" label="Referencia / Lote" rules={[{ required: true }]}>
            <Input placeholder="Ej. LOTE-2024-001" />
          </Form.Item>
          <Form.Item name="tipo" label="Tipo" initialValue="venta" rules={[{ required: true }]}>
            <Select>
              <Option value="venta">Venta</Option>
              <Option value="devolucion">Devolución</Option>
              <Option value="anulacion">Anulación</Option>
            </Select>
          </Form.Item>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="RD$" />
          </Form.Item>
          <Form.Item name="tarjetaUltimos4" label="Últimos 4 dígitos tarjeta">
            <Input maxLength={4} placeholder="****" />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Conciliación */}
      <Modal
        title="Crear Conciliación"
        open={modalConciliacion}
        onCancel={() => setModalConciliacion(false)}
        onOk={() => formConciliacion.submit()}
        confirmLoading={crearConciliacion.isPending}
        okText="Conciliar"
      >
        <Form form={formConciliacion} layout="vertical"
          onFinish={v => crearConciliacion.mutate({
            terminalId: v.terminalId,
            fechaDesde: v.rango[0].format('YYYY-MM-DD'),
            fechaHasta: v.rango[1].format('YYYY-MM-DD'),
            notas: v.notas,
          })}
        >
          <Form.Item name="terminalId" label="Terminal" rules={[{ required: true }]}>
            <Select placeholder="Selecciona terminal">
              {terminales.map((t: any) => (
                <Option key={t.id} value={t.id}>{t.banco} — {t.numeroTerminal}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="rango" label="Período" rules={[{ required: true }]}>
            <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} placeholder="Observaciones..." />
          </Form.Item>
        </Form>
        <Divider />
        <Text type="secondary" style={{ fontSize: 12 }}>
          Se conciliarán todas las transacciones <strong>pendientes</strong> del período seleccionado.
          El monto neto reflejará el depósito esperado del banco descontando comisiones.
        </Text>
      </Modal>
    </div>
  );
}
