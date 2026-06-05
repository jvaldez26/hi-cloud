import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Divider, Progress, Alert, Badge, theme } from 'antd';
import {
  WalletOutlined, PlusOutlined, PlusCircleOutlined, MinusCircleOutlined,
  LockOutlined, HistoryOutlined, ExclamationCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

const CATEGORIAS = [
  { value: 'materiales',   label: '📦 Materiales y útiles' },
  { value: 'transporte',   label: '🚗 Transporte y gasolina' },
  { value: 'alimentacion', label: '🍽️ Alimentación' },
  { value: 'comunicacion', label: '📱 Comunicación' },
  { value: 'limpieza',     label: '🧹 Limpieza' },
  { value: 'mensajeria',   label: '📬 Mensajería' },
  { value: 'reparacion',   label: '🔧 Reparaciones' },
  { value: 'impuestos',    label: '🏛️ Impuestos y tasas' },
  { value: 'otros',        label: '📋 Otros' },
];

const TIPO_COLOR: Record<string, string> = {
  apertura: 'blue', egreso: 'red', reposicion: 'green', ajuste: 'orange', cierre: 'default',
};

export default function CajaChicaPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search, setSearch] = useState('');
  const [cajaSeleccionada, setCajaSeleccionada] = useState<any>(null);
  const [modalCajaCrear,   setModalCajaCrear]   = useState(false);
  const [modalEgreso,      setModalEgreso]       = useState(false);
  const [modalReponer,     setModalReponer]       = useState(false);
  const [formCaja]   = Form.useForm();
  const [formEgreso] = Form.useForm();
  const [formReponer] = Form.useForm();

  const { data: resumen, isLoading } = useQuery<any>({
    queryKey: ['caja-chica-resumen'],
    queryFn:  () => api.get('/caja-chica/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: movimientos = [] } = useQuery<any[]>({
    queryKey: ['caja-movimientos', cajaSeleccionada?.id],
    queryFn:  () => api.get(`/caja-chica/cajas/${cajaSeleccionada.id}/movimientos`).then((r: any) => r.data?.data ?? r.data ?? []),
    enabled:  !!cajaSeleccionada?.id,
  });

  const movimientosFiltrados = useMemo(() =>
    (movimientos ?? []).filter(item =>
      String(item.descripcion ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.comprobante ?? item.referencia ?? '').toLowerCase().includes(search.toLowerCase())
    ), [movimientos, search]);

  const crearCaja = useMutation({
    mutationFn: (dto: any) => api.post('/caja-chica/cajas', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caja-chica-resumen'] }); setModalCajaCrear(false); formCaja.resetFields(); message.success('Caja chica creada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const registrarEgreso = useMutation({
    mutationFn: (dto: any) => api.post(`/caja-chica/cajas/${cajaSeleccionada?.id}/egreso`, dto),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['caja-chica-resumen'] });
      qc.invalidateQueries({ queryKey: ['caja-movimientos'] });
      setModalEgreso(false);
      formEgreso.resetFields();
      const resData = res?.data?.data ?? res?.data;
      if (resData?.alerta) {
        message.warning(`Egreso registrado. ⚠️ Saldo bajo: ${fmt(resData?.saldoActual)}`);
      } else {
        message.success('Egreso registrado');
      }
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const reponer = useMutation({
    mutationFn: (dto: any) => api.post(`/caja-chica/cajas/${cajaSeleccionada?.id}/reponer`, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caja-chica-resumen'] });
      qc.invalidateQueries({ queryKey: ['caja-movimientos'] }); setModalReponer(false); formReponer.resetFields(); message.success('Fondos repuestos'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const cerrar = useMutation({
    mutationFn: (id: number) => api.patch(`/caja-chica/cajas/${id}/cerrar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['caja-chica-resumen'] }); message.success('Caja cerrada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const COLS_DEF = [
    { key: 'fecha',     label: 'Fecha',       defaultVisible: true  },
    { key: 'tipo',      label: 'Tipo',        defaultVisible: true  },
    { key: 'desc',      label: 'Descripción', defaultVisible: true  },
    { key: 'monto',     label: 'Monto',       defaultVisible: true  },
    { key: 'sn',        label: 'Saldo',       defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('caja-chica', COLS_DEF);

  const cols = [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 100 },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 110,
      render: (v: any) => <Tag color={TIPO_COLOR[v]}>{v.toUpperCase()}</Tag>,
    },
    {
      title: 'Descripción', key: 'desc',
      render: (_: any, r: any) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.descripcion}</Text>
          {r.categoria && <div><Text type="secondary" style={{ fontSize: 11 }}>{CATEGORIAS.find(c => c.value === r.categoria)?.label ?? r.categoria}</Text></div>}
          {r.beneficiario && <div><Text type="secondary" style={{ fontSize: 11 }}>Para: {r.beneficiario}</Text></div>}
          {r.comprobante && <Tag style={{ fontSize: 10 }}>Comp: {r.comprobante}</Tag>}
        </div>
      ),
    },
    {
      title: 'Monto', dataIndex: 'monto', key: 'monto', align: 'right' as const, width: 110,
      render: (v: any, r: any) => (
        <Text style={{ color: r.tipo === 'egreso' ? '#ef4444' : '#059669', fontWeight: 600 }}>
          {r.tipo === 'egreso' ? '-' : '+'}{fmt(v)}
        </Text>
      ),
    },
    {
      title: 'Saldo', dataIndex: 'saldoNuevo', key: 'sn', align: 'right' as const, width: 110,
      render: (v: any) => <Text type="secondary">{fmt(v)}</Text>,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <WalletOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Caja Chica</Title>
            <Text type="secondary">Fondos rotatorios · Egresos menores · Control de saldos</Text>
          </div>
        </div>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Input
            placeholder="Buscar por descripción o referencia..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <RefreshByKeyButton queryKey={['caja-chica']} />
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCajaCrear(true)}>
            Nueva Caja Chica
          </Button>
        </span>
      </div>

      <Row gutter={[16, 16]}>
        {/* Lista de Cajas */}
        <Col xs={24} lg={cajaSeleccionada ? 8 : 24}>
          <Row gutter={[12, 12]}>
            {(resumen?.cajas ?? []).map((caja: any) => (
              <Col xs={24} sm={cajaSeleccionada ? 24 : 8} key={caja.id}>
                <Card
                  bordered={false}
                  style={{
                    borderRadius: 12,
                    border: cajaSeleccionada?.id === caja.id ? '2px solid #1a56db' : '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                  onClick={() => setCajaSeleccionada(caja)}
                >
                  {caja.enAlerta && (
                    <Alert type="warning" showIcon message="Saldo bajo" banner style={{ marginBottom: 12, fontSize: 11 }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text strong>{caja.nombre}</Text>
                    <Tag color={caja.estado === 'activa' ? 'green' : 'default'}>{caja.estado}</Tag>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: caja.enAlerta ? '#d97706' : '#1a56db', marginBottom: 8 }}>
                    {fmt(caja.saldoActual)}
                  </div>
                  <Progress
                    percent={100 - caja.pctUsado}
                    size="small"
                    strokeColor={caja.enAlerta ? '#d97706' : '#1a56db'}
                    format={p => `${p}% disponible`}
                    style={{ marginBottom: 8 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>Fondo inicial: {fmt(caja.montoInicial)}</Text>

                  {caja.estado === 'activa' && (
                    <Row gutter={6} style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                      <Col xs={24} sm={8}>
                        <Button size="small" icon={<MinusCircleOutlined />} danger block
                          onClick={() => { setCajaSeleccionada(caja); setModalEgreso(true); }}>
                          Egreso
                        </Button>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Button size="small" icon={<PlusCircleOutlined />} style={{ color: '#059669', borderColor: '#059669' }} block
                          onClick={() => { setCajaSeleccionada(caja); setModalReponer(true); }}>
                          Reponer
                        </Button>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Popconfirm title="¿Cerrar esta caja?" onConfirm={() => cerrar.mutate(caja.id)}>
                          <Button size="small" icon={<LockOutlined />} block>Cerrar</Button>
                        </Popconfirm>
                      </Col>
                    </Row>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </Col>

        {/* Historial de movimientos */}
        {cajaSeleccionada && (
          <Col xs={24} lg={16}>
            <Card
              bordered={false}
              style={{ borderRadius: 12 }}
              title={<Space><HistoryOutlined />Movimientos — {cajaSeleccionada.nombre}</Space>}
              extra={<Button size="small" type="link" onClick={() => setCajaSeleccionada(null)}>Cerrar ✕</Button>}
            >
              <Table
                dataSource={movimientosFiltrados}
                rowKey="id"
                size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 20 }}
                columns={filterColumns(cols)}
              />
            </Card>
          </Col>
        )}
      </Row>

      {/* Modal Crear Caja */}
      <Modal title="Nueva Caja Chica" open={modalCajaCrear} onCancel={() => setModalCajaCrear(false)}
        onOk={() => formCaja.submit()} confirmLoading={crearCaja.isPending} okText="Crear" width={480}>
        <Form form={formCaja} layout="vertical" onFinish={v => crearCaja.mutate(v)}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
            <Input placeholder="Caja Chica Oficina Principal" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="montoInicial" label="Monto Inicial (RD$)" rules={[{ required: true }]}>
                <InputNumber min={100} style={{ width: '100%' }} prefix="RD$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="montoMaximoEgreso" label="Máx. por Egreso (RD$)">
                <InputNumber min={0} style={{ width: '100%' }} prefix="RD$" placeholder="Sin límite" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="pctAlerta" label="Alerta cuando saldo baje de (%)" initialValue={20}>
                <InputNumber min={5} max={50} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="nombreResponsable" label="Responsable">
                <Input placeholder="Nombre del responsable" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción">
            <Input placeholder="Propósito de la caja chica..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Egreso */}
      <Modal title={`Registrar Egreso — ${cajaSeleccionada?.nombre}`} open={modalEgreso}
        onCancel={() => { setModalEgreso(false); formEgreso.resetFields(); }}
        onOk={() => formEgreso.submit()} confirmLoading={registrarEgreso.isPending} okText="Registrar" width={480}>
        {cajaSeleccionada && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
            <Text style={{ fontSize: 12 }}>Saldo disponible: <strong style={{ color: cajaSeleccionada.enAlerta ? '#d97706' : '#059669' }}>{fmt(cajaSeleccionada.saldoActual)}</strong></Text>
          </div>
        )}
        <Form form={formEgreso} layout="vertical"
          initialValues={{ fecha: dayjs() }}
          onFinish={v => registrarEgreso.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD'), monto: Number(v.monto) })}>
          <Row gutter={12}>
            <Col xs={24} sm={10}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="categoria" label="Categoría"><Select placeholder="Categoría (opcional)">{CATEGORIAS.map(c => <Option key={c.value} value={c.value}>{c.label}</Option>)}</Select></Form.Item></Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input placeholder="Ej. Compra de papel para impresora" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={10}><Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} prefix="RD$" /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="beneficiario" label="Beneficiario"><Input placeholder="Nombre de quien recibe" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="comprobante" label="No. Comprobante"><Input placeholder="Factura o recibo #" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal Reponer */}
      <Modal title={`Reponer Fondos — ${cajaSeleccionada?.nombre}`} open={modalReponer}
        onCancel={() => { setModalReponer(false); formReponer.resetFields(); }}
        onOk={() => formReponer.submit()} confirmLoading={reponer.isPending} okText="Reponer" width={440}>
        <Form form={formReponer} layout="vertical"
          initialValues={{ fecha: dayjs() }}
          onFinish={v => reponer.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD'), monto: Number(v.monto) })}>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="monto" label="Monto a Reponer (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} prefix="RD$" />
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} placeholder="Motivo de la reposición..." /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
