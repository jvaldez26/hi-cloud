import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Card, Row, Col, Typography, Statistic, Button, Table, Tag,
         Select, InputNumber, Space, message, Tabs, Popconfirm, Modal,
         Form, Input } from 'antd';
import { CalculatorOutlined, CheckOutlined, DollarOutlined,
         FileExcelOutlined, PlusOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { useAuthStore } from '../../store/auth.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;
const comisionesApi = {
  calcular:      (mes: number, anio: number, pct: number) =>
    api.post(`/comisiones/calcular?mes=${mes}&anio=${anio}&porcentaje=${pct}`).then(d),
  listar:        (periodo?: string, estado?: string) =>
    api.get(`/comisiones?${periodo ? `periodo=${periodo}&` : ''}${estado ? `estado=${estado}` : ''}`).then(d),
  miResumen:     () => api.get('/comisiones/mi-resumen').then(d),
  aprobar:       (id: number) => api.patch(`/comisiones/${id}/aprobar`).then(d),
  pagar:         (id: number) => api.patch(`/comisiones/${id}/pagar`).then(d),
  // Reglas
  reglas:        () => api.get('/comisiones/reglas').then(d),
  crearRegla:    (b: any) => api.post('/comisiones/reglas', b).then(d),
  deleteRegla:   (id: number) => api.delete(`/comisiones/reglas/${id}`).then(d),
  simular:       (b: any) => api.post('/comisiones/simular', b).then(d),
};

const estadoColor: Record<string, string> = {
  pendiente: 'orange', aprobada: 'blue', pagada: 'green', anulada: 'red',
};

function MiResumenTab() {
  const { data, isLoading } = useQuery({ queryKey: ['mis-comisiones'], queryFn: comisionesApi.miResumen });

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Total ganado',   value: data?.totales?.total,     color: '#1677ff' },
          { title: 'Pagado',         value: data?.totales?.pagado,    color: '#10b981' },
          { title: 'Pendiente',      value: data?.totales?.pendiente, color: '#f59e0b' },
        ].map((k, i) => (
          <Col xs={12} sm={8} key={k.title}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .08 }}>
              <Card size="small">
                <Statistic title={k.title} value={k.value ?? 0}
                  formatter={v => fmt.money(Number(v))} valueStyle={{ color: k.color }} />
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      <Table size="small"
        scroll={{ x: 'max-content' }} loading={isLoading}
        dataSource={data?.historico ?? []} rowKey={(r: any, i?: number) => `${r.periodo}-${r.estado}-${i}`}
        columns={[
          { title: 'Período', dataIndex: 'periodo',      width: 90 },
          { title: 'Ventas',  dataIndex: 'totalVentas',  render: (v: string) => fmt.money(Number(v)) },
          { title: 'Comisión',dataIndex: 'montoComision',render: (v: string) => <Text strong style={{ color: '#1677ff' }}>{fmt.money(Number(v))}</Text> },
          { title: 'Estado',  dataIndex: 'estado',       render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
        ]} pagination={false} />
    </>
  );
}

const COLS_DEF_COMISIONES = [
  { key: 'vend',              label: 'Vendedor',   defaultVisible: true  },
  { key: 'periodo',           label: 'Período',    defaultVisible: true  },
  { key: 'montoVenta',        label: 'Venta',      defaultVisible: true  },
  { key: 'porcentajeComision',label: '%',          defaultVisible: true  },
  { key: 'montoComision',     label: 'Comisión',   defaultVisible: true  },
  { key: 'estado',            label: 'Estado',     defaultVisible: true  },
];

function AdminTab() {
  const [mes,  setMes]  = useState(dayjs().month() + 1);
  const [anio, setAnio] = useState(dayjs().year());
  const [pct,  setPct]  = useState(5);
  const [estado, setEstado] = useState<string | undefined>();
  const qc = useQueryClient();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('comisiones', COLS_DEF_COMISIONES);

  const { data: lista, isLoading } = useQuery({
    queryKey: ['comisiones-lista', estado],
    queryFn:  () => comisionesApi.listar(undefined, estado),
  });

  const calcMut = useMutation({
    mutationFn: () => comisionesApi.calcular(mes, anio, pct),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['comisiones-lista'] }); message.success(`Calculadas ${r.resultados?.length ?? 0} comisiones para ${mes}/${anio}`); },
    onError:   (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const aprobarMut = useMutation({
    mutationFn: comisionesApi.aprobar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comisiones-lista'] }); message.success('Aprobada'); },
  });

  const pagarMut = useMutation({
    mutationFn: comisionesApi.pagar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comisiones-lista'] }); message.success('Marcada como pagada'); },
  });

  return (
    <>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Select value={mes} onChange={setMes} style={{ width: 130 }}
            options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }))} />
        </Col>
        <Col>
          <Select value={anio} onChange={setAnio} style={{ width: 100 }}
            options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
        </Col>
        <Col>
          <InputNumber value={pct} onChange={v => setPct(v ?? 5)} min={1} max={50}
            formatter={v => `${v}%`} style={{ width: 80 }} />
        </Col>
        <Col>
          <Button type="primary" icon={<CalculatorOutlined />} loading={calcMut.isPending}
            onClick={() => calcMut.mutate()}>
            Calcular comisiones
          </Button>
        </Col>
        <Col>
          <Select placeholder="Filtrar estado" allowClear style={{ width: 150 }}
            value={estado} onChange={setEstado}
            options={['pendiente','aprobada','pagada','anulada'].map(v => ({ value: v, label: v.toUpperCase() }))} />
        </Col>
        <Col>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (lista ?? []).map((r: any) => ({
              'Vendedor':   r.vendedor?.nombre ?? r.vendedorNombre ?? `#${r.vendedorId}`,
              'Período':    r.periodo ?? '',
              'Venta':      Number(r.montoVenta ?? 0),
              'Comisión %': Number(r.porcentajeComision ?? 0),
              'Comisión $': Number(r.montoComision ?? 0),
              'Estado':     r.estado ?? '',
            }));
            exportarExcel(filas, `Comisiones-${mes}-${anio}`);
          }}>Excel</Button>
            <RefreshByKeyButton queryKey={['comisiones']} />
            <VideoTutorialButton />
            <ColumnToggle columns={COLS_DEF_COMISIONES} visibleColumns={visibleColumns} onChange={updateVisibility} />
        </Col>
      </Row>

      <Table size="small"
        scroll={{ x: 'max-content' }} loading={isLoading}
        dataSource={lista ?? []} rowKey="id"
        columns={filterColumns([
          { title: 'Vendedor', key: 'vend', ellipsis: true,
            render: (_: any, r: any) => r.vendedor?.nombre ?? r.vendedorNombre ?? `#${r.vendedorId}`,
          },
          { title: 'Período',     dataIndex: 'periodo',             width: 90 },
          { title: 'Venta',       dataIndex: 'montoVenta',          render: (v: number) => fmt.money(v) },
          { title: '%',           dataIndex: 'porcentajeComision',  width: 60, render: (v: number) => `${v}%` },
          { title: 'Comisión',    dataIndex: 'montoComision',
            render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> },
          { title: 'Estado',      dataIndex: 'estado', width: 110,
            render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
          { title: '', key: 'actions', width: 130,
            render: (_: any, r: any) => (
              <Space size={4}>
                {r.estado === 'pendiente' && (
                  <Button size="small" icon={<CheckOutlined />} onClick={() => aprobarMut.mutate(r.id)}>Aprobar</Button>
                )}
                {r.estado === 'aprobada' && (
                  <Popconfirm title="¿Confirmar pago?" onConfirm={() => pagarMut.mutate(r.id)}>
                    <Button size="small" type="primary" icon={<DollarOutlined />}>Pagar</Button>
                  </Popconfirm>
                )}
              </Space>
            )},
        ])} />
    </>
  );
}

// ── Tab Reglas de Comisión ──────────────────────────────────────────────────
function ReglasTab() {
  const [open, setOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [form] = Form.useForm();
  const [formSim] = Form.useForm();
  const qc = useQueryClient();
  const watchTipo = Form.useWatch('tipo', form);

  const { data: reglas, isLoading } = useQuery({ queryKey: ['reglas-comision'], queryFn: comisionesApi.reglas });

  const crearMut = useMutation({
    mutationFn: comisionesApi.crearRegla,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reglas-comision'] }); setOpen(false); form.resetFields(); message.success('Regla creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: comisionesApi.deleteRegla,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reglas-comision'] }); message.success('Regla eliminada'); },
  });

  const TIPO_LABEL: Record<string, string> = {
    global: '🌍 Global', por_vendedor: '👤 Por Vendedor',
    por_categoria: '📦 Por Categoría', por_monto: '💵 Por Monto',
    por_antiguedad: '📅 Por Antigüedad Cobro',
  };

  const cols = [
    { title: 'Prioridad', dataIndex: 'prioridad', width: 80 },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'Tipo', dataIndex: 'tipo', width: 150, render: (v: string) => TIPO_LABEL[v] ?? v },
    { title: '%', dataIndex: 'porcentaje', width: 80, render: (v: number) => <Tag color="blue">{v}%</Tag> },
    { title: 'Condición', key: 'cond', ellipsis: true, render: (_: any, r: any) => {
        if (r.tipo === 'por_vendedor')   return `Vendedor ID: ${r.vendedorId}`;
        if (r.tipo === 'por_categoria')  return `Cat: ${r.categoria}`;
        if (r.tipo === 'por_monto')      return `${fmt.money(r.montoDesde ?? 0)} — ${r.montoHasta ? fmt.money(r.montoHasta) : '∞'}`;
        if (r.tipo === 'por_antiguedad') return `Cobrado en ≤${r.diasMaximoCobro} días`;
        return 'Aplica a todos';
    } },
    { title: 'Estado', dataIndex: 'activa', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activa' : 'Inactiva'}</Tag> },
    { title: '', key: 'del', width: 60,
      render: (_: any, r: any) => <Popconfirm title="¿Eliminar regla?" onConfirm={() => delMut.mutate(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  return (
    <>
      <Row justify="space-between" style={{ marginBottom: 12 }}>
        <Col>
          <Button icon={<ThunderboltOutlined />} onClick={() => { formSim.resetFields(); setSimOpen(true); setSimResult(null); }}>
            Simular comisión
          </Button>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Nueva regla</Button>
        </Col>
      </Row>
      <Table columns={cols} dataSource={reglas ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />

      <Modal title="Nueva regla de comisión" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={540}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="prioridad" label="Prioridad" initialValue={100}><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={Object.entries(TIPO_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="porcentaje" label="% Comisión" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} addonAfter="%" /></Form.Item></Col>
            {watchTipo === 'por_vendedor'   && <Col span={24}><Form.Item name="vendedorId" label="ID del vendedor"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>}
            {watchTipo === 'por_categoria'  && <Col span={24}><Form.Item name="categoria"  label="Categoría del producto"><Input /></Form.Item></Col>}
            {watchTipo === 'por_monto'      && <>
              <Col xs={24} sm={12}><Form.Item name="montoDesde" label="Monto desde (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="montoHasta" label="Monto hasta (RD$)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            </>}
            {watchTipo === 'por_antiguedad' && <Col span={24}><Form.Item name="diasMaximoCobro" label="Cobrado en máximo (días)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>}
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>

      <Modal title="Simular comisión" open={simOpen} onCancel={() => { setSimOpen(false); setSimResult(null); }} footer={null} width={420}>
        <Form form={formSim} layout="vertical" onFinish={async (v) => {
          const r = await comisionesApi.simular(v);
          setSimResult(r);
        }}>
          <Form.Item name="monto" label="Monto de venta (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="categoria" label="Categoría producto"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="diasPago" label="Días para cobro"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block icon={<ThunderboltOutlined />}>Calcular</Button>
        </Form>
        {simResult && (
          <Card style={{ marginTop: 16 }} size="small">
            <Row gutter={12}>
              <Col xs={24} sm={12}><Statistic title="Regla aplicada" value={simResult.reglaAplicada} valueStyle={{ fontSize: 13 }} /></Col>
              <Col xs={24} sm={12}><Statistic title="% Comisión" value={simResult.porcentaje} suffix="%" valueStyle={{ color: '#1677ff' }} /></Col>
              <Col xs={24} sm={12}><Statistic title="Monto venta" formatter={v => fmt.money(Number(v))} value={simResult.monto} /></Col>
              <Col xs={24} sm={12}><Statistic title="Comisión" formatter={v => fmt.money(Number(v))} value={simResult.comision} valueStyle={{ color: '#52c41a', fontWeight: 700 }} /></Col>
            </Row>
          </Card>
        )}
      </Modal>
    </>
  );
}

export default function ComisionesPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'contador';

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Comisiones de Vendedores</Title>
      <Card>
        <Tabs defaultActiveKey={isAdmin ? 'admin' : 'mias'} items={[
          { key: 'mias',  label: '💰 Mis Comisiones',      children: <MiResumenTab /> },
          ...(isAdmin ? [
            { key: 'admin',  label: '⚙️ Gestión',          children: <AdminTab /> },
            { key: 'reglas', label: '📋 Reglas Avanzadas',  children: <ReglasTab /> },
          ] : []),
        ]} />
      </Card>
    </div>
  );
}
