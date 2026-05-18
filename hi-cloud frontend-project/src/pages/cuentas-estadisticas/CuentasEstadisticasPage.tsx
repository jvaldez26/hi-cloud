import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Typography, Statistic,
  Modal, Form, Input, InputNumber, Select, Space, Popconfirm,
  message, Tabs, Descriptions,
} from 'antd';
import { PlusOutlined, DeleteOutlined, BarChartOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { TableActions } from '../../components/ui/TableActions';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;
const ceApi = {
  dashboard:     ()               => api.get('/cuentas-estadisticas/dashboard').then(d),
  listar:        ()               => api.get('/cuentas-estadisticas').then(d),
  crear:         (b: any)         => api.post('/cuentas-estadisticas', b).then(d),
  delete:        (id: number)     => api.delete(`/cuentas-estadisticas/${id}`).then(d),
  movimientos:   (id: number, desde?: string, hasta?: string) => {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    return api.get(`/cuentas-estadisticas/${id}/movimientos?${q}`).then(d);
  },
  registrar:     (b: any)         => api.post('/cuentas-estadisticas/movimientos', b).then(d),
  deleteMovimiento: (id: number)  => api.delete(`/cuentas-estadisticas/movimientos/${id}`).then(d),
  resumenMensual:(id: number, anio: number) => api.get(`/cuentas-estadisticas/${id}/resumen-mensual?anio=${anio}`).then(d),
};

const TIPO_LABEL: Record<string, string> = {
  acumulador: '∑ Acumulador', promedio: 'Ø Promedio',
  maximo: '↑ Máximo', conteo: '# Conteo',
};
const TIPO_COLOR: Record<string, string> = {
  acumulador: 'blue', promedio: 'purple', maximo: 'orange', conteo: 'green',
};
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Tab Cuentas ───────────────────────────────────────────────────────────────
function CuentasTab() {
  const [open,    setOpen]    = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [regOpen, setRegOpen] = useState<any>(null);
  const [anio,    setAnio]    = useState(dayjs().year());
  const [form]    = Form.useForm();
  const [formReg] = Form.useForm();
  const qc = useQueryClient();

  const { data: cuentas, isLoading } = useQuery({ queryKey: ['cuentas-est'], queryFn: ceApi.listar });
  const { data: resumen } = useQuery({
    queryKey: ['resumen-mensual', detalle?.id, anio],
    queryFn: () => ceApi.resumenMensual(detalle.id, anio),
    enabled: !!detalle,
  });
  const { data: movs } = useQuery({
    queryKey: ['movimientos-est', detalle?.id],
    queryFn: () => ceApi.movimientos(detalle.id),
    enabled: !!detalle,
  });

  const crearMut = useMutation({
    mutationFn: ceApi.crear,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cuentas-est'] }); qc.invalidateQueries({ queryKey: ['ce-dashboard'] }); setOpen(false); form.resetFields(); message.success('Cuenta creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: ceApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cuentas-est'] }); qc.invalidateQueries({ queryKey: ['ce-dashboard'] }); message.success('Eliminada'); },
  });
  const regMut = useMutation({
    mutationFn: ceApi.registrar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimientos-est', detalle?.id] }); qc.invalidateQueries({ queryKey: ['resumen-mensual', detalle?.id, anio] }); qc.invalidateQueries({ queryKey: ['ce-dashboard'] }); setRegOpen(null); formReg.resetFields(); message.success('Valor registrado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMovMut = useMutation({
    mutationFn: ceApi.deleteMovimiento,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimientos-est', detalle?.id] }); qc.invalidateQueries({ queryKey: ['resumen-mensual', detalle?.id, anio] }); },
  });

  const chartData = (resumen?.meses ?? []).map((m: any, i: number) => ({
    mes: MESES[i], valor: m.valor,
  }));

  const COLS_DEF = [
    { key: 'codigo',       label: 'Código',        defaultVisible: true  },
    { key: 'nombre',       label: 'Nombre',         defaultVisible: true  },
    { key: 'tipo',         label: 'Tipo',           defaultVisible: true  },
    { key: 'unidad',       label: 'Unidad',         defaultVisible: false },
    { key: 'categoria',    label: 'Categoría',      defaultVisible: false },
    { key: 'valorMesSuma', label: 'Valor este mes', defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('cuentas-estadisticas', COLS_DEF);

  const cols = filterColumns([
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 90, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', ellipsis: true },
    { title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 120,
      render: (v: string) => <Tag color={TIPO_COLOR[v]}>{TIPO_LABEL[v] ?? v}</Tag> },
    { title: 'Unidad', dataIndex: 'unidad', key: 'unidad', width: 80 },
    { title: 'Categoría', dataIndex: 'categoria', key: 'categoria', width: 100, render: (v: string) => v ?? '—' },
    { title: 'Valor este mes', dataIndex: 'valorMesSuma', key: 'valorMesSuma', width: 120, render: (v: number, r: any) => `${fmt.number(v)} ${r.unidad}` },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalle(r)}
          viewLabel="Ver detalle"
          items={[
            { key: 'register', label: 'Registrar valor', icon: <PlusCircleOutlined />,
              onClick: () => { setRegOpen(r); formReg.setFieldsValue({ cuentaId: r.id, fecha: dayjs().format('YYYY-MM-DD') }); } },
            { type: 'divider' as const },
            { key: 'delete', label: 'Eliminar', danger: true, icon: <DeleteOutlined />,
              onClick: () => delMut.mutate(r.id) },
          ]}
        />
      ) },
  ]);

  const movCols = [
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Valor', dataIndex: 'valor', width: 120, render: (v: number, r: any) => `${fmt.number(v)} ${detalle?.unidad}` },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true, render: (v: string) => v ?? '—' },
    { title: 'Referencia', dataIndex: 'referencia', width: 110, render: (v: string) => v ?? '—' },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => <Popconfirm title="¿Eliminar?" onConfirm={() => delMovMut.mutate(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm> },
  ];

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Space>
          <RefreshByKeyButton queryKey={['cuentas-estadisticas']} />
          <VideoTutorialButton />
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>Nueva cuenta</Button>
        </Space>
      </Row>
      <Table columns={cols} dataSource={cuentas ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />

      {/* Modal crear cuenta */}
      <Modal title="Nueva cuenta estadística" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="EST-001" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo" initialValue="acumulador">
              <Select options={Object.entries(TIPO_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="unidad" label="Unidad" initialValue="unidades"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="categoria" label="Categoría"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>

      {/* Modal registrar valor */}
      <Modal title={`Registrar valor — ${regOpen?.nombre}`} open={!!regOpen}
        onCancel={() => { setRegOpen(null); formReg.resetFields(); }} footer={null} width={420}>
        <Form form={formReg} layout="vertical" onFinish={(v) => regMut.mutate(v)}>
          <Form.Item name="cuentaId" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="valor" label={`Valor (${regOpen?.unidad ?? 'unidades'})`} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción"><Input /></Form.Item>
          <Form.Item name="referencia" label="Referencia"><Input /></Form.Item>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setRegOpen(null); formReg.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={regMut.isPending}>Registrar</Button></Col></Row>
        </Form>
      </Modal>

      {/* Modal detalle con gráfica */}
      <Modal title={`${detalle?.codigo} — ${detalle?.nombre}`} open={!!detalle}
        onCancel={() => setDetalle(null)} footer={null} width={800}>
        {detalle && (
          <>
            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={8}><Statistic title="Tipo" value={TIPO_LABEL[detalle.tipo] ?? detalle.tipo} /></Col>
              <Col xs={24} sm={8}><Statistic title="Unidad" value={detalle.unidad} /></Col>
              <Col xs={24} sm={8}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Año visualizado</Text><br />
                  <Select value={anio} onChange={setAnio} style={{ width: 100 }}
                    options={[2024,2025,2026,2027].map(y => ({ value: y, label: String(y) }))} />
                </div>
              </Col>
            </Row>
            <Card size="small" title="Evolución mensual" style={{ marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Line type="monotone" dataKey="valor" stroke="#1677ff" strokeWidth={2} dot={{ r: 3 }} name={detalle.unidad} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Title level={5}>Movimientos recientes</Title>
            <Row justify="end" style={{ marginBottom: 8 }}>
              <Button size="small" icon={<PlusCircleOutlined />} onClick={() => { setRegOpen(detalle); formReg.setFieldsValue({ cuentaId: detalle.id, fecha: dayjs().format('YYYY-MM-DD') }); }}>
                Registrar valor
              </Button>
            </Row>
            <Table columns={movCols} dataSource={movs ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
          </>
        )}
      </Modal>
    </>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = useQuery({ queryKey: ['ce-dashboard'], queryFn: ceApi.dashboard });
  return (
    <Row gutter={[12, 12]}>
      {(data?.cuentas ?? []).map((c: any) => (
        <Col xs={24} sm={12} md={8} key={c.id}>
          <Card size="small" title={<><Text code style={{ fontSize: 11 }}>{c.codigo}</Text> {c.nombre}</>}
            extra={<Tag color={TIPO_COLOR[c.tipo]}>{TIPO_LABEL[c.tipo]}</Tag>}>
            <Statistic value={c.valorMesSuma} suffix={c.unidad}
              formatter={v => fmt.number(Number(v))}
              valueStyle={{ fontSize: 20, color: '#1677ff' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{c.registrosMes} registro(s) este mes</Text>
            {c.categoria && <><br /><Tag style={{ marginTop: 4 }}>{c.categoria}</Tag></>}
          </Card>
        </Col>
      ))}
      {!isLoading && (data?.cuentas ?? []).length === 0 && (
        <Col span={24} style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
          No hay cuentas estadísticas. Crea una desde la pestaña Cuentas.
        </Col>
      )}
    </Row>
  );
}

// ── Page Principal ─────────────────────────────────────────────────────────────
export default function CuentasEstadisticasPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Cuentas Estadísticas</Title>
      <Card>
        <Tabs defaultActiveKey="dashboard" items={[
          { key: 'dashboard', label: <><BarChartOutlined /> Dashboard del mes</>, children: <DashboardTab /> },
          { key: 'cuentas',   label: <><PlusOutlined /> Cuentas y Registros</>, children: <CuentasTab /> },
        ]} />
      </Card>
    </div>
  );
}
