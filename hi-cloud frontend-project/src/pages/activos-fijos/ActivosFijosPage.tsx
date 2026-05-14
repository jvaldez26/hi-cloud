import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic,
         Modal, Form, Input, InputNumber, Select, Tabs, message,
         Space, Progress, Popconfirm, DatePicker, Drawer } from 'antd';
import { PlusOutlined, ToolOutlined, BarChartOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { activosFijosApi, type ActivoPayload } from '../../api/activos-fijos.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title } = Typography;

const estadoColor: Record<string, string> = {
  activo: 'green', vendido: 'blue', dado_de_baja: 'red', totalmente_depreciado: 'orange',
};

export default function ActivosFijosPage() {
  const [open, setOpen]         = useState(false);
  const [openBaja, setOpenBaja] = useState<any>(null);
  const [openDepr, setOpenDepr] = useState(false);
  const [openHist, setOpenHist] = useState<any>(null);
  const [page, setPage]         = useState(1);
  const [form] = Form.useForm<ActivoPayload>();
  const [formBaja] = Form.useForm();
  const [formDepr] = Form.useForm();
  const qc = useQueryClient();

  const { data: resumen }    = useQuery({ queryKey: ['activos-resumen'],    queryFn: activosFijosApi.resumen });
  const { data: categorias } = useQuery({ queryKey: ['categorias-activos'], queryFn: activosFijosApi.categorias });
  const { data: activos, isLoading } = useQuery({ queryKey: ['activos', page], queryFn: () => activosFijosApi.activos(page, 12) });
  const { data: historial } = useQuery({ queryKey: ['historial-activo', openHist?.id], queryFn: () => activosFijosApi.historial(openHist.id), enabled: !!openHist });

  const onErr = (e: any, fb: string) => message.error((e as any)?.friendlyMessage ?? fb);
  const createMut  = useMutation({ mutationFn: activosFijosApi.createActivo, onSuccess: () => { qc.invalidateQueries({ queryKey: ['activos'] }); setOpen(false); form.resetFields(); message.success('Activo registrado'); }, onError: (e: any) => onErr(e, 'Error al registrar activo') });
  const bajaMut    = useMutation({ mutationFn: ({ id, body }: any) => activosFijosApi.darDeBaja(id, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['activos'] }); setOpenBaja(null); message.success('Activo dado de baja'); }, onError: (e: any) => onErr(e, 'Error al dar de baja') });
  const deprMut    = useMutation({ mutationFn: activosFijosApi.procesarDepreciacion, onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['activos'] }); setOpenDepr(false); message.success(`${d.activosDepreciados} activos depreciados — Total: ${fmt.money(d.totalDepreciacion)}`); }, onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al procesar') });

  const cols = [
    { title: 'Código',      dataIndex: 'codigo',        width: 100 },
    { title: 'Descripción', dataIndex: 'descripcion',   ellipsis: true },
    { title: 'Categoría',   key: 'cat',                 width: 140, render: (_: any, r: any) => r.categoria?.nombre },
    { title: 'Costo Hist.', dataIndex: 'costoAdquisicion', width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Dep. Acum.',  dataIndex: 'depreciacionAcumulada', width: 110, render: (v: number) => fmt.money(v) },
    { title: 'Valor Libros',dataIndex: 'valorLibros',   width: 120,
      render: (v: number, r: any) => {
        const pct = r.costoAdquisicion > 0 ? (v / r.costoAdquisicion) * 100 : 0;
        return <><strong>{fmt.money(v)}</strong><Progress percent={pct} size="small" showInfo={false} strokeColor={pct > 30 ? '#52c41a' : '#ff4d4f'} /></>;
      }},
    { title: 'Estado',      dataIndex: 'estado',        width: 110,
      render: (v: string) => <Tag color={estadoColor[v]}>{v.replace('_', ' ').toUpperCase()}</Tag> },
    {
      title: '', key: 'actions', width: 110,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<BarChartOutlined />} onClick={() => setOpenHist(r)} />
          {r.estado === 'activo' && <Button size="small" danger onClick={() => setOpenBaja(r)}>Baja</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Activos Fijos — Ley 11-92 DGII</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Activos activos',     value: resumen?.totalActivos ?? 0,   suffix: 'activos',   money: false },
          { label: 'Costo histórico',     value: resumen?.costoHistorico ?? 0, money: true },
          { label: 'Dep. acumulada',      value: resumen?.depAcumulada ?? 0,   money: true, color: '#ff7a45' },
          { label: 'Valor en libros',     value: resumen?.valorLibros ?? 0,    money: true, color: '#1677ff' },
        ].map(k => (
          <Col xs={24} sm={12} md={6} key={k.label}>
            <Card>
              <Statistic title={k.label} value={k.value}
                formatter={v => k.money ? fmt.money(Number(v)) : v}
                suffix={k.suffix} valueStyle={{ color: (k as any).color }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card extra={
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (activos?.data ?? []).map((a: any) => ({
              'Código':       a.codigo ?? '',
              'Nombre':       a.nombre ?? '',
              'Categoría':    a.categoria ?? '',
              'Valor Compra': Number(a.valorCompra ?? 0),
              'Valor Libro':  Number(a.valorLibro ?? a.valorActual ?? 0),
              'Depreciación': Number(a.depreciacionAcumulada ?? 0),
              'Vida Útil':    a.vidaUtilAnios ?? '',
              'Estado':       a.estado ?? '',
              'Ubicación':    a.ubicacion ?? '',
            }));
            exportarExcel(filas, 'Activos-Fijos');
          }}>Excel</Button>
          <Button icon={<ToolOutlined />} onClick={() => setOpenDepr(true)}>Procesar depreciación</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); }}>Nuevo activo</Button>
        </Space>
      }>
        <Table columns={cols} dataSource={activos?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: activos?.meta?.total, pageSize: 12, current: page, onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Crear activo */}
      <Modal title="Registrar Activo Fijo" open={open} onCancel={() => setOpen(false)} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={v => createMut.mutate(v)}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={16}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="categoriaId" label="Categoría DGII" rules={[{ required: true }]}>
              <Select options={categorias?.map((c: any) => ({ value: c.id, label: `${c.nombre} (${c.tasaAnual}% — ${c.metodo.replace('_', ' ')})` }))} />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="fechaAdquisicion" label="Fecha Adquisición" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col span={8}><Form.Item name="costoAdquisicion" label="Costo (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="valorResidual" label="Valor Residual"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={8}><Form.Item name="vidaUtilAnios" label="Vida Útil (años)"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col span={12}><Form.Item name="ubicacion" label="Ubicación"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="proveedor" label="Proveedor"><Input /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Dar de baja */}
      <Modal title={`Dar de baja — ${openBaja?.descripcion}`} open={!!openBaja} onCancel={() => setOpenBaja(null)} footer={null}>
        <Form form={formBaja} layout="vertical" onFinish={v => bajaMut.mutate({ id: openBaja.id, body: { ...v, fecha: v.fecha?.format('YYYY-MM-DD') } })}>
          <Form.Item name="fecha" label="Fecha de baja" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="motivo" label="Motivo" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="valorVenta" label="Valor de venta (si aplica)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenBaja(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" danger htmlType="submit" loading={bajaMut.isPending}>Confirmar baja</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Procesar depreciación */}
      <Modal title="Procesar Depreciación Mensual" open={openDepr} onCancel={() => setOpenDepr(false)} footer={null}>
        <Form form={formDepr} layout="vertical" onFinish={v => deprMut.mutate(v.periodo)}>
          <Form.Item name="periodo" label="Período (YYYY-MM)" rules={[{ required: true, pattern: /^\d{4}-\d{2}$/, message: 'Formato: 2026-05' }]}>
            <Input placeholder={dayjs().format('YYYY-MM')} />
          </Form.Item>
          <p>Se calculará la depreciación para todos los activos activos usando las tasas DGII (Ley 11-92). El sistema generará el asiento contable automáticamente.</p>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenDepr(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={deprMut.isPending}>Procesar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Historial depreciación */}
      <Drawer title={`Historial — ${openHist?.descripcion}`} open={!!openHist} onClose={() => setOpenHist(null)} width={650}>
        <Table dataSource={historial ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }} pagination={false}
          columns={[
            { title: 'Período',     dataIndex: 'periodo',            width: 90 },
            { title: 'Método',      dataIndex: 'metodo',             width: 120, render: (v: string) => v.replace('_', ' ') },
            { title: 'Val. Inicio', dataIndex: 'valorLibrosInicio',  render: (v: number) => fmt.money(v) },
            { title: 'Depreciación',dataIndex: 'montoDepreciacion',  render: (v: number) => <strong style={{ color: '#ff7a45' }}>{fmt.money(v)}</strong> },
            { title: 'Val. Final',  dataIndex: 'valorLibrosFin',     render: (v: number) => fmt.money(v) },
          ]} />
      </Drawer>
    </div>
  );
}
