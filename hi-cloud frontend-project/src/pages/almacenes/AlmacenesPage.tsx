import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, Tabs, Popconfirm,
  message, Progress, Select, InputNumber, Badge, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SwapOutlined,
  InboxOutlined, WarningOutlined, CheckOutlined, FileExcelOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const almApi = {
  resumen:     ()                => api.get('/almacenes/resumen').then(r => r.data?.data ?? r.data),
  listar:      ()                => api.get('/almacenes').then(r => r.data?.data ?? r.data ?? []),
  crear:       (b: any)          => api.post('/almacenes', b).then(r => r.data?.data ?? r.data),
  eliminar:    (id: number)      => api.delete(`/almacenes/${id}`).then(r => r.data?.data ?? r.data),
  stock:       (id: number)      => api.get(`/almacenes/${id}/stock`).then(r => r.data?.data ?? r.data ?? []),
  transferencias: (p = 1, almId?: number) =>
    api.get(`/almacenes/transferencias?page=${p}${almId ? `&almacenId=${almId}` : ''}`).then(r => r.data?.data ?? r.data),
  crearTransf: (b: any)          => api.post('/almacenes/transferencias', b).then(r => r.data?.data ?? r.data),
  confirmar:   (id: number)      => api.patch(`/almacenes/transferencias/${id}/confirmar`).then(r => r.data?.data ?? r.data),
  cancelar:    (id: number)      => api.patch(`/almacenes/transferencias/${id}/cancelar`).then(r => r.data?.data ?? r.data),
  productos:   ()                => api.get('/productos?limit=200').then(r => r.data?.data?.data ?? r.data?.data ?? []),
};

const ESTADO_TRANSF: Record<string, { label: string; color: string }> = {
  borrador:    { label: 'Borrador',    color: 'default' },
  en_transito: { label: 'En tránsito', color: 'processing' },
  completada:  { label: 'Completada',  color: 'success' },
  cancelada:   { label: 'Cancelada',   color: 'error' },
};

export default function AlmacenesPage() {
  const { token } = theme.useToken();
  const [almSeleccionado, setAlmSeleccionado] = useState<any>(null);
  const [crearModal,  setCrearModal]  = useState(false);
  const [transfModal, setTransfModal] = useState(false);
  const [formAlm]    = Form.useForm();
  const [formTransf] = Form.useForm();
  const qc = useQueryClient();

  const { data: resumen }    = useQuery({ queryKey: ['alm-resumen'], queryFn: almApi.resumen });
  const { data: almacenes }  = useQuery({ queryKey: ['alm-list'],    queryFn: almApi.listar });
  const { data: stock, isLoading: loadStock } = useQuery({
    queryKey: ['alm-stock', almSeleccionado?.id],
    queryFn:  () => almApi.stock(almSeleccionado!.id),
    enabled:  !!almSeleccionado,
  });
  const { data: transferencias } = useQuery({
    queryKey: ['alm-transf', almSeleccionado?.id],
    queryFn:  () => almApi.transferencias(1, almSeleccionado?.id),
    enabled:  !!almSeleccionado,
  });
  const { data: productos } = useQuery({ queryKey: ['productos-alm'], queryFn: almApi.productos });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['alm-resumen'] });
    qc.invalidateQueries({ queryKey: ['alm-list'] });
    qc.invalidateQueries({ queryKey: ['alm-stock'] });
    qc.invalidateQueries({ queryKey: ['alm-transf'] });
  };

  const crearMut = useMutation({
    mutationFn: almApi.crear,
    onSuccess: () => { inv(); setCrearModal(false); formAlm.resetFields(); message.success('Almacén creado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const transfMut = useMutation({
    mutationFn: almApi.crearTransf,
    onSuccess: () => { inv(); setTransfModal(false); formTransf.resetFields(); message.success('Transferencia creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const confirmarMut = useMutation({
    mutationFn: almApi.confirmar,
    onSuccess: () => { inv(); message.success('Transferencia confirmada — stock actualizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Stock insuficiente'),
  });

  const cancelarMut = useMutation({
    mutationFn: almApi.cancelar,
    onSuccess: () => { inv(); message.success('Transferencia cancelada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cancelar'),
  });

  const colsStock = [
    { title: 'Código',   key: 'cod', width: 100, render: (_: any, r: any) => r.producto?.codigo },
    { title: 'Producto', key: 'nom', ellipsis: true, render: (_: any, r: any) => r.producto?.nombre },
    { title: 'Stock',    dataIndex: 'stock', width: 100,
      render: (v: number, r: any) => (
        <Text strong style={{ color: Number(v) <= Number(r.stockMinimo) ? '#ef4444' : '#10b981' }}>
          {Number(v).toFixed(2)}
        </Text>
      )},
    { title: 'Mínimo',  dataIndex: 'stockMinimo', width: 80 },
    { title: 'Estado', key: 'est', width: 110,
      render: (_: any, r: any) => Number(r.stock) <= Number(r.stockMinimo)
        ? <Tag icon={<WarningOutlined />} color="warning">Stock bajo</Tag>
        : <Tag color="success">OK</Tag> },
  ];

  const colsTransf = [
    { title: 'Número',   dataIndex: 'numero',  width: 130, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Origen',   key: 'orig', width: 130, render: (_: any, r: any) => r.almacenOrigen?.nombre },
    { title: 'Destino',  key: 'dest', width: 130, render: (_: any, r: any) => r.almacenDestino?.nombre },
    { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => r.producto?.nombre },
    { title: 'Cantidad', dataIndex: 'cantidad', width: 90 },
    { title: 'Fecha',    dataIndex: 'fecha',    width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Estado',   dataIndex: 'estado',   width: 120,
      render: (v: string) => {
        const s = ESTADO_TRANSF[v] ?? { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }},
    { title: '', key: 'actions', width: 160,
      render: (_: any, r: any) => (
        <Space size={4}>
          {r.estado === 'borrador' && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              loading={confirmarMut.isPending}
              onClick={() => confirmarMut.mutate(r.id)}>
              Confirmar
            </Button>
          )}
          {(r.estado === 'borrador' || r.estado === 'en_transito') && (
            <Popconfirm title="¿Cancelar transferencia?" onConfirm={() => cancelarMut.mutate(r.id)}
              okButtonProps={{ danger: true }} okText="Cancelar transferencia" cancelText="No">
              <Button size="small" danger type="text" icon={<CloseCircleOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <InboxOutlined style={{ marginRight: 8, color: '#06b6d4' }} />
            Almacenes Múltiples
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (almacenes ?? []).map((a: any) => ({
                'Código':    a.codigo ?? '',
                'Nombre':    a.nombre ?? '',
                'Tipo':      a.tipo ?? '',
                'Ubicación': a.ubicacion ?? '',
                'Responsable': a.responsable ?? '',
                'Activo':    a.isActive ? 'Sí' : 'No',
              }));
              exportarExcel(filas, `Almacenes-${dayjs().format('YYYY-MM-DD')}`);
            }}>Excel</Button>
            <RefreshByKeyButton queryKey={['almacenes']} />
            <VideoTutorialButton />
            <Button icon={<SwapOutlined />} onClick={() => setTransfModal(true)}>
              Nueva transferencia
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearModal(true)}>
              Nuevo almacén
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Tarjetas de almacenes */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {(resumen ?? []).map((alm: any) => (
          <Col xs={24} sm={12} md={8} key={alm.id}>
            <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
              <Card
                onClick={() => setAlmSeleccionado(alm)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 12,
                  border: almSeleccionado?.id === alm.id
                    ? `2px solid ${token.colorInfo}`
                    : `1px solid ${token.colorBorderSecondary}`,
                  boxShadow: almSeleccionado?.id === alm.id
                    ? `0 0 0 3px ${token.colorInfoBg}`
                    : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong style={{ fontSize: 15 }}>{alm.nombre}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{alm.ciudad ?? alm.responsable ?? '—'}</Text>
                  </div>
                  {alm.stockBajo > 0 && (
                    <Badge count={alm.stockBajo} title="Productos con stock bajo">
                      <WarningOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                    </Badge>
                  )}
                </div>
                <Row gutter={8} style={{ marginTop: 12 }}>
                  <Col xs={24} sm={12}>
                    <Statistic title="Productos" value={alm.totalProductos} valueStyle={{ fontSize: 20 }} />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic title="Valor estimado" value={fmt.money(alm.valorTotal)}
                      valueStyle={{ fontSize: 14, color: token.colorInfo }} />
                  </Col>
                </Row>
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      {/* Panel detalle almacén seleccionado */}
      {almSeleccionado && (
        <Tabs items={[
          {
            key: 'stock',
            label: <><InboxOutlined /> Stock</>,
            children: (
              <Card title={`Stock en ${almSeleccionado.nombre}`}>
                <Table columns={colsStock} dataSource={stock ?? []} rowKey="id"
                  loading={loadStock} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
              </Card>
            ),
          },
          {
            key: 'transferencias',
            label: <><SwapOutlined /> Transferencias</>,
            children: (
              <Card title={`Transferencias — ${almSeleccionado.nombre}`}>
                <Table columns={colsTransf} dataSource={Array.isArray(transferencias) ? transferencias : (transferencias?.data ?? [])} rowKey="id"
                  size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
              </Card>
            ),
          },
        ]} />
      )}

      {/* Modal crear almacén */}
      <Modal title="Nuevo Almacén" open={crearModal}
        onCancel={() => setCrearModal(false)} footer={null} width={480}>
        <Form form={formAlm} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={14}><Form.Item name="direccion" label="Dirección"><Input /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="ciudad" label="Ciudad"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="responsable" label="Responsable"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal transferencia */}
      <Modal title={<><SwapOutlined /> Transferencia entre almacenes</>}
        open={transfModal} onCancel={() => setTransfModal(false)} footer={null} width={520}>
        <Form form={formTransf} layout="vertical"
          onFinish={v => transfMut.mutate({ ...v, fecha: new Date().toISOString().slice(0,10) })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="almacenOrigenId" label="Almacén origen" rules={[{ required: true }]}>
              <Select options={(almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="almacenDestinoId" label="Almacén destino" rules={[{ required: true }]}>
              <Select options={(almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={(productos ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.001} step={1} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setTransfModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={transfMut.isPending}>
              Crear transferencia
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
