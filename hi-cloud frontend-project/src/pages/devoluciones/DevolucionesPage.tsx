import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic, Space,
         Modal, Form, Input, Select, InputNumber, DatePicker, message,
         Popconfirm, Drawer, Descriptions } from 'antd';
import { PlusOutlined, RollbackOutlined, CheckOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

type EstadoDev = 'pendiente' | 'procesada' | 'anulada';

const estadoColor: Record<EstadoDev, string> = {
  pendiente: 'orange', procesada: 'green', anulada: 'red',
};

const devolucionesApi = {
  list:    (p = 1, limit = 10) => api.get(`/devoluciones?page=${p}&limit=${limit}`).then(r => r.data?.data ?? r.data),
  getOne:  (id: number)        => api.get(`/devoluciones/${id}`).then(r => r.data?.data ?? r.data),
  resumen: ()                  => api.get('/devoluciones/resumen').then(r => r.data?.data ?? r.data),
  create:  (body: any)         => api.post('/devoluciones', body).then(r => r.data?.data ?? r.data),
  procesar:(id: number)        => api.post(`/devoluciones/${id}/procesar`).then(r => r.data?.data ?? r.data),
  anular:  (id: number)        => api.patch(`/devoluciones/${id}/anular`).then(r => r.data?.data ?? r.data),
};

const facturasApi = {
  buscar: (search: string) => api.get(`/facturas?search=${search}&limit=10`).then(r => r.data?.data ?? r.data),
  getOne: (id: number)     => api.get(`/facturas/${id}`).then(r => r.data?.data ?? r.data),
};

export default function DevolucionesPage() {
  const [page,   setPage]   = useState(1);
  const [open,   setOpen]   = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [form]              = Form.useForm();
  const [facturaSelId, setFacturaSelId] = useState<number | null>(null);
  const [lineas, setLineas] = useState<any[]>([]);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['devoluciones', page], queryFn: () => devolucionesApi.list(page) });
  const { data: resumen }   = useQuery({ queryKey: ['dev-resumen'], queryFn: devolucionesApi.resumen });

  const { data: facturaDetalle } = useQuery({
    queryKey: ['factura-detalle', facturaSelId],
    queryFn: () => facturasApi.getOne(facturaSelId!),
    enabled: !!facturaSelId,
  });

  const createMut = useMutation({
    mutationFn: devolucionesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devoluciones'] }); setOpen(false); form.resetFields(); setLineas([]); setFacturaSelId(null); message.success('Devolución registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const procesarMut = useMutation({
    mutationFn: devolucionesApi.procesar,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      const ncNumero = res?.notaCreditoNumero ?? res?.data?.notaCreditoNumero;
      message.success(
        ncNumero
          ? `✅ Devolución procesada. Nota de Crédito E34 ${ncNumero} generada automáticamente.`
          : 'Devolución procesada: inventario y contabilidad actualizados',
        5,
      );
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const anularMut = useMutation({
    mutationFn: devolucionesApi.anular,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devoluciones'] }); message.success('Devolución anulada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al anular devolución'),
  });

  const onFacturaChange = (id: number) => {
    setFacturaSelId(id);
    const detalles = facturaDetalle?.detalles ?? [];
    setLineas(detalles.map((d: any) => ({ ...d, devolver: d.cantidad })));
  };

  const handleSubmit = (values: any) => {
    createMut.mutate({
      facturaId: values.facturaId,
      fecha:     values.fecha.format('YYYY-MM-DD'),
      tipo:      values.tipo,
      motivo:    values.motivo,
      detalles:  lineas.filter(l => l.devolver > 0).map(l => ({
        productoId:     l.productoId,
        descripcion:    l.descripcion,
        cantidad:       l.devolver,
        precioUnitario: Number(l.precioUnitario),
        porcentajeIva:  Number(l.porcentajeIva),
      })),
    });
  };

  const cols = [
    { title: 'Número',   dataIndex: 'numero',          width: 170, render: (v: string) => <code>{v}</code> },
    { title: 'Fecha',    dataIndex: 'fecha',            width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Tipo',     dataIndex: 'tipo',             width: 80,  render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'Cliente',  key: 'cli',                    ellipsis: true, render: (_: any, r: any) => r.cliente?.nombre },
    { title: 'Factura',  key: 'fac',                    width: 150, render: (_: any, r: any) => r.factura?.folio },
    { title: 'Total',    dataIndex: 'total',             width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Estado',   dataIndex: 'estado',            width: 110,
      render: (v: EstadoDev) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
    {
      title: 'NC E34 Generada', key: 'nc', width: 140,
      render: (_: any, r: any) => r.notaCreditoNumero
        ? <Tag color="green" style={{ fontSize: 11 }}>✓ {r.notaCreditoNumero}</Tag>
        : r.estado === 'procesada'
          ? <Tag color="default" style={{ fontSize: 10 }}>—</Tag>
          : null,
    },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetail(r)}
          viewLabel="Ver devolución"
          items={[
            ...(r.estado === 'pendiente' ? [
              { key: 'procesar', label: 'Procesar devolución', icon: <CheckOutlined />,
                onClick: () => { if (window.confirm('¿Procesar? Se revertirá el inventario y se generará la NC E34.')) procesarMut.mutate(r.id); } },
            ] : []),
            { type: 'divider' as const },
            ...(r.estado === 'pendiente' ? [
              { key: 'anular', label: 'Anular devolución', danger: true,
                onClick: () => { if (window.confirm('¿Anular esta devolución?')) anularMut.mutate(r.id); } },
            ] : []),
          ]}
        />
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Devoluciones</Title>

      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(Array.isArray(resumen) ? resumen : []).map((r: any, i: number) => (
          <Col xs={12} md={8} key={r.estado}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card size="small">
                <Statistic title={r.estado.toUpperCase()} value={r.cantidad}
                  suffix={<small> · {fmt.money(r.montoTotal)}</small>}
                  valueStyle={{ color: estadoColor[r.estado as EstadoDev] }} />
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      <Card extra={
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((d: any) => ({
              'Número':    d.numero ?? '',
              'Fecha':     d.fecha ?? '',
              'Cliente':   d.cliente?.nombre ?? '',
              'Factura':   d.facturaFolio ?? d.factura?.folio ?? '',
              'Motivo':    d.motivo?.replace(/_/g,' ') ?? '',
              'Total':     Number(d.total ?? d.montoTotal ?? 0),
              'Estado':    d.estado ?? '',
            }));
            exportarExcel(filas, 'Devoluciones');
          }}>Excel</Button>
          <RefreshByKeyButton queryKey={['devoluciones']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); setLineas([]); }}>
            Nueva devolución
          </Button>
        </Space>
      }>
        <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Modal crear */}
      <Modal title="Registrar Devolución" open={open} onCancel={() => setOpen(false)} footer={null} width={760}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ fecha: dayjs(), tipo: 'total' }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="facturaId" label="Factura original" rules={[{ required: true }]}>
                <Select showSearch filterOption={false} placeholder="Buscar por folio o cliente..."
                  onSearch={async (v) => { if (v.length < 2) return; }}
                  onChange={onFacturaChange}
                  options={[]}
                  notFoundContent={<Button type="link" size="small" onClick={async () => {
                    const folio = form.getFieldValue('buscarFactura');
                    if (!folio) return;
                    const res = await facturasApi.buscar(folio);
                    // simplified: for demo
                  }}>Buscar</Button>}
                />
              </Form.Item>
              <Form.Item name="buscarFactura" label="Folio de factura">
                <Input.Search placeholder="FAC-202601-0001" onSearch={async (v) => {
                  const res = await facturasApi.buscar(v);
                  if (res?.data?.[0]) { setFacturaSelId(res.data[0].id); form.setFieldValue('facturaId', res.data[0].id); onFacturaChange(res.data[0].id); }
                }} enterButton="Cargar" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" /></Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="tipo" label="Tipo">
                <Select options={[{ value: 'total', label: 'Total' }, { value: 'parcial', label: 'Parcial' }]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="motivo" label="Motivo de devolución" rules={[{ required: true }]}>
                <Input.TextArea rows={2} placeholder="Producto defectuoso, error en pedido, etc." />
              </Form.Item>
            </Col>
          </Row>

          {lineas.length > 0 && (
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={lineas.map((l, i) => ({ ...l, key: i }))}
              columns={[
                { title: 'Producto',  dataIndex: 'descripcion',    ellipsis: true },
                { title: 'Facturado', dataIndex: 'cantidad',        width: 80 },
                { title: 'A devolver', key: 'dev', width: 120,
                  render: (_: any, r: any, idx: number) => (
                    <InputNumber min={0} max={r.cantidad} precision={0} value={r.devolver} style={{ width: '100%' }}
                      onChange={v => { const u=[...lineas]; u[idx].devolver=v??0; setLineas(u); }} />
                  )},
                { title: 'Precio', dataIndex: 'precioUnitario', width: 100, render: (v: number) => fmt.money(v) },
              ]} />
          )}

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending} disabled={lineas.filter(l=>l.devolver>0).length===0}>Registrar devolución</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Detalle */}
      <Drawer title={`Devolución ${detail?.numero}`} open={!!detail} onClose={() => setDetail(null)} width={600}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Número">{detail.numero}</Descriptions.Item>
              <Descriptions.Item label="Estado"><Tag color={estadoColor[detail.estado as EstadoDev]}>{detail.estado.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Tipo">{detail.tipo}</Descriptions.Item>
              <Descriptions.Item label="Fecha">{fmt.date(detail.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Cliente">{detail.cliente?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Factura original">{detail.factura?.folio}</Descriptions.Item>
              <Descriptions.Item label="Motivo" span={2}>{detail.motivo}</Descriptions.Item>
            </Descriptions>
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false} dataSource={detail.detalles ?? []} rowKey="id"
              columns={[
                { title: 'Producto', dataIndex: 'descripcion', ellipsis: true },
                { title: 'Cant.',    dataIndex: 'cantidad',    width: 60 },
                { title: 'Precio',   dataIndex: 'precioUnitario', render: (v: number) => fmt.money(v) },
                { title: 'Total',    dataIndex: 'total', render: (v: number) => <strong>{fmt.money(v)}</strong> },
              ]} />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={24} sm={8}><Statistic title="Subtotal" value={detail.subtotal} formatter={v => fmt.money(Number(v))} /></Col>
              <Col xs={24} sm={8}><Statistic title="ITBIS" value={detail.iva} formatter={v => fmt.money(Number(v))} /></Col>
              <Col xs={24} sm={8}><Statistic title="Total devuelto" value={detail.total} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#dc2626' }} /></Col>
            </Row>
          </>
        )}
      </Drawer>
    </div>
  );
}
