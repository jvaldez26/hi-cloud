import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Divider, theme,
} from 'antd';
import {
  RollbackOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, EyeOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const MOTIVOS = [
  { value: 'devolucion',   label: 'Devolución de mercancía' },
  { value: 'defecto',      label: 'Mercancía defectuosa' },
  { value: 'descuento',    label: 'Descuento otorgado por proveedor' },
  { value: 'error_precio', label: 'Error en precio facturado' },
  { value: 'otro',         label: 'Otro motivo' },
];

const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador: { color: 'default', label: 'Borrador' },
  recibida: { color: 'green',   label: 'Confirmada' },
  anulada:  { color: 'red',     label: 'Anulada'   },
};

const COLS_DEF = [
  { key: 'n',   label: 'Número',      defaultVisible: true  },
  { key: 'f',   label: 'Fecha',       defaultVisible: true  },
  { key: 'p',   label: 'Proveedor',   defaultVisible: true  },
  { key: 'm',   label: 'Motivo',      defaultVisible: false },
  { key: 'cof', label: 'Compra ref.', defaultVisible: false },
  { key: 't',   label: 'Total',       defaultVisible: true  },
  { key: 'e',   label: 'Estado',      defaultVisible: true  },
];

export default function NotasCreditoComprasPage() {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('notas-credito-compras', COLS_DEF);
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalCrear,   setModalCrear]   = useState(false);
  const [modalDetalle, setModalDetalle] = useState<any>(null);
  const [formCrear] = Form.useForm();

  const { data: proveedores = [] } = useQuery<any[]>({
    queryKey: ['proveedores-select'],
    queryFn:  () => api.get('/proveedores?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn:  () => api.get('/productos?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['ncc-resumen'],
    queryFn:  () => api.get('/notas-credito-compras/resumen').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: notas, isLoading } = useQuery<any>({
    queryKey: ['notas-credito-compras'],
    queryFn:  () => api.get('/notas-credito-compras?limit=50').then((r: any) => r.data?.data ?? r.data),
  });

  const errMsg = (e: any) =>
    e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado';

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/notas-credito-compras', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      setModalCrear(false); formCrear.resetFields();
      message.success('Nota de crédito creada');
    },
    onError: (e: any) => message.error(`Error al crear NC: ${errMsg(e)}`, 6),
  });

  const recibir = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito-compras/${id}/recibir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC confirmada — inventario actualizado');
    },
    onError: (e: any) => message.error(`Error al confirmar NC: ${errMsg(e)}`, 6),
  });

  const anular = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito-compras/${id}/anular`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC anulada');
    },
    onError: (e: any) => message.error(`Error al anular NC: ${errMsg(e)}`, 6),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/notas-credito-compras/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC eliminada');
    },
    onError: (e: any) => message.error(`Error al eliminar NC: ${errMsg(e)}`, 6),
  });

  const handleCrear = (values: any) => {
    crear.mutate({
      ...values,
      fecha: values.fecha?.format('YYYY-MM-DD'),
      detalles: (values.detalles ?? []).map((d: any) => ({ ...d, cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario) })),
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RollbackOutlined style={{ fontSize: 28, color: token.colorWarning }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Notas de Crédito — Compras</Title>
            <Text type="secondary">Devoluciones y ajustes con proveedores · Reversa de inventario automática</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (notas?.data ?? []).map((n: any) => ({
              'Número':    n.numero ?? '',
              'Fecha':     n.fecha ? dayjs(n.fecha).format('DD/MM/YYYY') : '',
              'Proveedor': n.proveedor?.nombre ?? '',
              'Motivo':    n.motivo?.replace(/_/g,' ') ?? '',
              'Total':     Number(n.total ?? 0),
              'Estado':    n.estado ?? '',
            }));
            exportarExcel(filas, `NC-Compras-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['notas-credito-compras']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nueva NC Compra
          </Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={notas?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          scroll={{ x: 'max-content' }}
          columns={filterColumns([
            { title: 'Número',    dataIndex: 'numero', key: 'n', width: 110,
              render: (v: any) => <Text strong style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v}</Text> },
            { title: 'Fecha',     dataIndex: 'fecha',  key: 'f', width: 90,
              render: (v: any) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{String(v).split('T')[0]}</span> },
            { title: 'Proveedor', key: 'p', ellipsis: true, minWidth: 130,
              render: (_: any, r: any) => <Text strong ellipsis>{r.proveedor?.nombre}</Text> },
            { title: 'Motivo',    dataIndex: 'motivo', key: 'm', width: 130,
              render: (v: any) => <Tag style={{ whiteSpace: 'nowrap' }}>{MOTIVOS.find((x: any) => x.value === v)?.label ?? v}</Tag> },
            { title: 'Compra ref.', dataIndex: 'compraOriginalFolio', key: 'cof', width: 150,
              render: (v: any) => v ? <Tag color="blue" style={{ whiteSpace: 'nowrap' }}>{v}</Tag> : '—' },
            { title: 'Total',  dataIndex: 'total', key: 't', align: 'right' as const, width: 110,
              render: (v: any) => <Text strong style={{ color: token.colorWarning, whiteSpace: 'nowrap' }}>{fmt(v)}</Text> },
            { title: 'Estado', dataIndex: 'estado', key: 'e', width: 100,
              render: (v: any) => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag> },
            {
              title: '', key: 'acc', width: 200,
              render: (_: any, r: any) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => setModalDetalle(r)} />
                  {r.estado === 'borrador' && (
                    <Popconfirm title="¿Confirmar NC? El inventario será ajustado." onConfirm={() => recibir.mutate(r.id)}>
                      <Button size="small" icon={<CheckCircleOutlined />}
                        style={{ color: token.colorSuccess, borderColor: token.colorSuccess }}>
                        Confirmar
                      </Button>
                    </Popconfirm>
                  )}
                  {r.estado === 'recibida' && (
                    <Popconfirm title="¿Anular?" onConfirm={() => anular.mutate(r.id)}>
                      <Button size="small" danger icon={<CloseCircleOutlined />}>Anular</Button>
                    </Popconfirm>
                  )}
                  {r.estado === 'borrador' && (
                    <Popconfirm title="¿Eliminar?" onConfirm={() => eliminar.mutate(r.id)}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ] as any)}
        />
      </Card>

      {/* Modal Crear */}
      <Modal
        title={<Space><RollbackOutlined />Nueva NC de Compra — Devolución a Proveedor</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear en Borrador"
        width={700}
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical" onFinish={handleCrear}
          initialValues={{ fecha: dayjs(), detalles: [{}] }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children">
                  {proveedores.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="compraOriginalFolio" label="OC Original">
                <Input placeholder="COM-202505-0001" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="motivo" label="Motivo" rules={[{ required: true }]}>
                <Select>
                  {MOTIVOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="descripcionMotivo" label="Descripción"><Input /></Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" style={{ fontSize: 13 }}>Ítems a devolver</Divider>
          <Form.List name="detalles">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={8}>
                      <Form.Item name={[name, 'productoId']} noStyle>
                        <Select showSearch optionFilterProp="children" placeholder="Producto" allowClear style={{ width: '100%' }}
                          onChange={pid => {
                            const p = productos.find((x: any) => x.id === pid);
                            if (p) { const ds = formCrear.getFieldValue('detalles'); ds[name] = { ...ds[name], descripcion: p.nombre, precioUnitario: p.precio }; formCrear.setFieldsValue({ detalles: ds }); }
                          }}>
                          {productos.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={7}><Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true }]}><Input placeholder="Descripción *" /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'cantidad']} noStyle><InputNumber min={0.01} placeholder="Cant." style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={4}><Form.Item name={[name, 'precioUnitario']} noStyle><InputNumber min={0} placeholder="Precio" style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={1}>{fields.length > 1 && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />}</Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Agregar ítem</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal title={`NC ${modalDetalle?.numero}`} open={!!modalDetalle} onCancel={() => setModalDetalle(null)} footer={null} width={580} destroyOnClose>
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12}><Text type="secondary" style={{ fontSize: 11 }}>Proveedor</Text><div><Text strong>{modalDetalle.proveedor?.nombre}</Text></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Estado</Text><div><Tag color={ESTADO_CONFIG[modalDetalle.estado]?.color}>{ESTADO_CONFIG[modalDetalle.estado]?.label}</Tag></div></Col>
            </Row>
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={modalDetalle.detalles} rowKey="id" pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cant.', dataIndex: 'cantidad', key: 'c', align: 'right' },
                { title: 'Precio', dataIndex: 'precioUnitario', key: 'p', align: 'right', render: v => fmt(v) },
                { title: 'ITBIS', dataIndex: 'iva', key: 'i', align: 'right', render: v => fmt(v) },
                { title: 'Total', dataIndex: 'total', key: 't', align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
              ]}
            />
            <Divider />
            <Row justify="end" gutter={16}>
              <Col><Text type="secondary">Subtotal: {fmt(modalDetalle.subtotal)}</Text></Col>
              <Col><Text type="secondary">ITBIS: {fmt(modalDetalle.iva)}</Text></Col>
              <Col><Text strong style={{ fontSize: 16, color: token.colorWarning }}>Total NC: {fmt(modalDetalle.total)}</Text></Col>
            </Row>
          </>
        )}
      </Modal>
    </div>
  );
}
