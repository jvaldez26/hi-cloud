import { useState } from 'react';
import {
  Card, Button, Table, Tag, Modal, Form, Input, Select,
  InputNumber, Space, Typography, message, theme, Popconfirm,
  Descriptions, Divider, Alert,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, StopOutlined,
  FileTextOutlined, DollarOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import { FileExcelOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const METODOS = [
  { value: 'efectivo',      label: '💵 Efectivo' },
  { value: 'transferencia', label: '🏦 Transferencia' },
  { value: 'cheque',        label: '📄 Cheque' },
  { value: 'tarjeta',       label: '💳 Tarjeta' },
  { value: 'deposito',      label: '🏧 Depósito' },
];

const ESTADO_COLOR: Record<string, string> = {
  activo:   'blue',
  aplicado: 'green',
  anulado:  'red',
};

export default function AnticiposClientePage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const COLS_DEF = [
    { key: 'n',   label: 'Número',         defaultVisible: true  },
    { key: 'f',   label: 'Fecha',          defaultVisible: true  },
    { key: 'c',   label: 'Cliente',        defaultVisible: true  },
    { key: 'mt',  label: 'Monto',          defaultVisible: true  },
    { key: 'mp',  label: 'Pendiente',      defaultVisible: true  },
    { key: 'tp',  label: 'Tipo Pago',      defaultVisible: true  },
    { key: 'st',  label: 'Estado',         defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('anticipos-cliente', COLS_DEF);

  const [search,       setSearch]       = useState('');
  const [modalCrear,   setModalCrear]   = useState(false);
  const [modalAplicar, setModalAplicar] = useState<any>(null);   // anticipo seleccionado
  const [detalleAnt,   setDetalleAnt]   = useState<any>(null);
  const [formCrear]   = Form.useForm();
  const [formAplicar] = Form.useForm();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: anticipos = [], isLoading } = useQuery<any[]>({
    queryKey: ['anticipos', search],
    queryFn:  () => api.get(`/anticipos?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then(r => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : (d?.data ?? []);
    }),
  });

  // CxC del cliente seleccionado para aplicar anticipo
  // Endpoint correcto: GET /cxc/cliente/:id (no /cxc?clienteId=X)
  const clienteAplicarId = Form.useWatch('cxcClienteId', formAplicar);
  const { data: cxcCliente = [] } = useQuery<any[]>({
    queryKey: ['cxc-cliente-aplicar', clienteAplicarId],
    queryFn:  () => api.get(`/cxc/cliente/${clienteAplicarId}?limit=50`).then(r => {
      const d = r.data?.data ?? r.data;
      return (Array.isArray(d) ? d : (d?.data ?? [])).filter((c: any) =>
        c.estado !== 'pagada' && c.estado !== 'anulada',
      );
    }),
    enabled: !!clienteAplicarId,
    staleTime: 0,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const crearMut = useMutation({
    mutationFn: (dto: any) => api.post('/anticipos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anticipos'] });
      qc.invalidateQueries({ queryKey: ['anticipos-resumen'] });
      setModalCrear(false);
      formCrear.resetFields();
      message.success('Anticipo registrado correctamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar', 5),
  });

  const aplicarMut = useMutation({
    mutationFn: ({ anticipoId, dto }: { anticipoId: number; dto: any }) =>
      api.post(`/anticipos/${anticipoId}/aplicar`, dto),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['anticipos'] });
      qc.invalidateQueries({ queryKey: ['anticipos-resumen'] });
      qc.invalidateQueries({ queryKey: ['cxc'] });
      setModalAplicar(null);
      formAplicar.resetFields();
      const d = res.data?.data ?? res.data;
      message.success(`Anticipo aplicado — RD$ ${Number(d?.montoAplicado ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} aplicados`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al aplicar', 5),
  });

  const anularMut = useMutation({
    mutationFn: (id: number) => api.delete(`/anticipos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anticipos'] });
      qc.invalidateQueries({ queryKey: ['anticipos-resumen'] });
      message.success('Anticipo anulado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular', 5),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAbrirAplicar = (anticipo: any) => {
    setModalAplicar(anticipo);
    formAplicar.setFieldsValue({
      cxcClienteId: anticipo.clienteId ?? undefined,
      monto:        Number(anticipo.montoPendiente),
    });
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DollarOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Anticipos de Clientes</Title>
            <Text type="secondary">Pagos recibidos antes de emitir factura · Se aplican al facturar</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por número o cliente..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            exportarExcel(anticipos.map((a: any) => ({
              Número:    a.numero,
              Fecha:     a.fechaRegistro,
              Cliente:   a.clienteNombre ?? '',
              Monto:     Number(a.monto ?? 0),
              Pendiente: Number(a.montoPendiente ?? 0),
              'Tipo Pago': a.tipoPago ?? '',
              Estado:    a.estado ?? '',
            })), `Anticipos-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['anticipos']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Anticipo
          </Button>
        </Space>
      </div>

      {/* Tabla */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={anticipos}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={filterColumns([
            {
              title: 'Número', dataIndex: 'numero', key: 'n', width: 100,
              render: (v: any) => <Text strong style={{ fontFamily: 'monospace', color: token.colorPrimary }}>{v}</Text>,
            },
            { title: 'Fecha', dataIndex: 'fechaRegistro', key: 'f', width: 100 },
            { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', render: (v: any) => <Text strong>{v ?? '—'}</Text> },
            {
              title: 'Monto', dataIndex: 'monto', key: 'mt', align: 'right' as const, width: 130,
              render: (v: any) => <Text>{fmt(Number(v))}</Text>,
            },
            {
              title: 'Pendiente', dataIndex: 'montoPendiente', key: 'mp', align: 'right' as const, width: 130,
              render: (v: any, r: any) => (
                <Text strong style={{ color: r.estado === 'aplicado' ? token.colorSuccess : token.colorPrimary }}>
                  {fmt(Number(v))}
                </Text>
              ),
            },
            {
              title: 'Tipo Pago', dataIndex: 'tipoPago', key: 'tp', width: 130,
              render: (v: any) => <Tag>{METODOS.find(m => m.value === v)?.label ?? v}</Tag>,
            },
            {
              title: 'Estado', dataIndex: 'estado', key: 'st', width: 100,
              render: (v: any) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.toUpperCase()}</Tag>,
            },
            {
              title: '', key: 'acc', width: 72, align: 'right' as const, fixed: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setDetalleAnt(r)}
                  viewLabel="Ver detalle"
                  items={[
                    {
                      key: 'aplicar', label: 'Aplicar a factura',
                      icon: <CheckOutlined />,
                      disabled: r.estado !== 'activo',
                      onClick: () => handleAbrirAplicar(r),
                    },
                    { type: 'divider' as const },
                    {
                      key: 'anular', label: 'Anular anticipo',
                      icon: <StopOutlined />, danger: true,
                      disabled: r.estado !== 'activo',
                      onClick: () => {
                        Modal.confirm({
                          title: '¿Anular este anticipo?',
                          icon: <StopOutlined style={{ color: '#EF4444' }} />,
                          content: `Anticipo ${r.numero} — ${fmt(Number(r.monto))}`,
                          okText: 'Anular', okButtonProps: { danger: true },
                          cancelText: 'Cancelar',
                          onOk: () => anularMut.mutateAsync(r.id),
                        });
                      },
                    },
                  ]}
                />
              ),
            },
          ] as any)}
        />
      </Card>

      {/* ── Modal Crear ──────────────────────────────────────────────────── */}
      <Modal
        title={<Space><DollarOutlined style={{ color: token.colorPrimary }} />Nuevo Anticipo de Cliente</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crearMut.isPending}
        okText="Registrar Anticipo"
        width={480}
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical"
          initialValues={{ tipoPago: 'efectivo' }}
          onFinish={v => crearMut.mutate({
            ...v,
            monto:         Number(v.monto),
            clienteNombre: clientes.find((c: any) => c.id === v.clienteId)?.nombre,
          })}
        >
          <Form.Item name="clienteId" label="Cliente (opcional)">
            <Select allowClear showSearch optionFilterProp="children" placeholder="Sin cliente específico">
              {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="RD$" size="large" />
          </Form.Item>
          <Form.Item name="tipoPago" label="Tipo de Pago" rules={[{ required: true }]}>
            <Select>{METODOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input placeholder="Anticipo para orden #, proyecto, etc." />
          </Form.Item>
          <Form.Item name="referencia" label="Referencia (cheque, transferencia #)">
            <Input placeholder="Número de referencia" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Aplicar a Factura ────────────────────────────────────── */}
      <Modal
        title={<Space><CheckOutlined style={{ color: token.colorSuccess }} />Aplicar Anticipo a Factura</Space>}
        open={!!modalAplicar}
        onCancel={() => { setModalAplicar(null); formAplicar.resetFields(); }}
        onOk={() => formAplicar.submit()}
        confirmLoading={aplicarMut.isPending}
        okText="Aplicar"
        okButtonProps={{ style: { background: token.colorSuccess, borderColor: token.colorSuccess } }}
        width={520}
        destroyOnClose
      >
        {modalAplicar && (
          <>
            <Alert
              style={{ marginBottom: 16 }}
              message={`Anticipo ${modalAplicar.numero} — Saldo disponible: ${fmt(Number(modalAplicar.montoPendiente))}`}
              type="info"
              showIcon
            />
            <Form form={formAplicar} layout="vertical"
              onFinish={v => aplicarMut.mutate({
                anticipoId: modalAplicar.id,
                dto: { cxcId: v.cxcId, monto: Number(v.monto) },
              })}
            >
              <Form.Item name="cxcClienteId" label="Cliente">
                <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente"
                  onChange={() => formAplicar.setFieldValue('cxcId', undefined)}>
                  {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="cxcId" label="Factura / CxC pendiente" rules={[{ required: true }]}>
                <Select
                  disabled={!clienteAplicarId}
                  placeholder={!clienteAplicarId ? 'Selecciona un cliente primero' : 'Seleccionar CxC'}
                  notFoundContent="Sin facturas pendientes"
                >
                  {cxcCliente.map((c: any) => (
                    <Option key={c.id} value={c.id}>
                      {c.factura?.folio ?? c.factura?.numero ?? `CxC #${c.id}`} — Pendiente: {fmt(Number(c.montoPendiente))}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="monto" label="Monto a aplicar (RD$)" rules={[{ required: true }]}>
                <InputNumber
                  min={0.01}
                  max={Number(modalAplicar.montoPendiente)}
                  precision={2}
                  style={{ width: '100%' }}
                  prefix="RD$"
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* ── Drawer Detalle ────────────────────────────────────────────── */}
      <Modal
        title={<Space><FileTextOutlined />{detalleAnt?.numero ?? 'Detalle'}</Space>}
        open={!!detalleAnt}
        onCancel={() => setDetalleAnt(null)}
        footer={null}
        width={420}
      >
        {detalleAnt && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Número">
              <Text strong style={{ fontFamily: 'monospace' }}>{detalleAnt.numero}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Fecha">{detalleAnt.fechaRegistro}</Descriptions.Item>
            <Descriptions.Item label="Cliente"><Text strong>{detalleAnt.clienteNombre ?? '—'}</Text></Descriptions.Item>
            <Descriptions.Item label="Monto"><Text strong>{fmt(Number(detalleAnt.monto))}</Text></Descriptions.Item>
            <Descriptions.Item label="Pendiente">
              <Text strong style={{ color: token.colorPrimary }}>{fmt(Number(detalleAnt.montoPendiente))}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tipo Pago">
              <Tag>{METODOS.find(m => m.value === detalleAnt.tipoPago)?.label ?? detalleAnt.tipoPago}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Estado">
              <Tag color={ESTADO_COLOR[detalleAnt.estado]}>{detalleAnt.estado?.toUpperCase()}</Tag>
            </Descriptions.Item>
            {detalleAnt.descripcion && <Descriptions.Item label="Descripción">{detalleAnt.descripcion}</Descriptions.Item>}
            {detalleAnt.referencia  && <Descriptions.Item label="Referencia">{detalleAnt.referencia}</Descriptions.Item>}
            <Descriptions.Item label="Cajero">{detalleAnt.nombreUsuario ?? '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
