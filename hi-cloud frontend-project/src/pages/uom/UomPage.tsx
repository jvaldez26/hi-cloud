import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Typography, Space, Modal,
  Form, Input, InputNumber, Select, message, Popconfirm,
  Tag, Tabs, Alert, Statistic, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SwapOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const d = (r: any) => r.data?.data ?? r.data;

const uomApi = {
  unidades:        (tipo?: string) => api.get(`/uom${tipo ? `?tipo=${tipo}` : ''}`).then(d),
  inicializar:     ()              => api.post('/uom/inicializar', {}).then(d),
  crearUnidad:     (b: any)        => api.post('/uom', b).then(d),
  deleteUnidad:    (id: number)    => api.delete(`/uom/${id}`).then(d),
  conversiones:    (uid?: number)  => api.get(`/uom/conversiones${uid ? `?unidadId=${uid}` : ''}`).then(d),
  crearConversion: (b: any)        => api.post('/uom/conversiones', b).then(d),
  deleteConversion:(id: number)    => api.delete(`/uom/conversiones/${id}`).then(d),
  convertir:       (cantidad: number, desde: number, hasta: number) =>
    api.get(`/uom/convertir?cantidad=${cantidad}&desdeId=${desde}&hastaId=${hasta}`).then(d),
};

const TIPO_COLOR: Record<string, string> = {
  peso: 'blue', volumen: 'cyan', longitud: 'green',
  area: 'purple', tiempo: 'orange', cantidad: 'default', otro: 'default',
};
const TIPO_LABEL: Record<string, string> = {
  peso: '⚖️ Peso', volumen: '🧴 Volumen', longitud: '📏 Longitud',
  area: '▪️ Área', tiempo: '⏱️ Tiempo', cantidad: '📦 Cantidad', otro: '📋 Otro',
};

// ── Tab Unidades ───────────────────────────────────────────────────────────────
const UOM_COLS_DEF = [
  { key: 'codigo',  label: 'Código',  defaultVisible: true  },
  { key: 'nombre',  label: 'Nombre',  defaultVisible: true  },
  { key: 'simbolo', label: 'Símbolo', defaultVisible: true  },
  { key: 'tipo',    label: 'Tipo',    defaultVisible: true  },
  { key: 'esBase',  label: 'Base',    defaultVisible: false },
];

function UnidadesTab() {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('uom', UOM_COLS_DEF);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: unidades, isLoading } = useQuery({ queryKey: ['uom-unidades'], queryFn: () => uomApi.unidades() });

  const inicMut = useMutation({
    mutationFn: uomApi.inicializar,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['uom-unidades'] }); qc.invalidateQueries({ queryKey: ['uom-conversiones'] }); message.success(`${r.total} unidades y ${r.conversiones} conversiones inicializadas`); },
    onError: (e: any) => message.info(e?.response?.data?.message ?? 'Ya inicializado'),
  });
  const crearMut = useMutation({
    mutationFn: uomApi.crearUnidad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uom-unidades'] }); setOpen(false); form.resetFields(); message.success('Unidad creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: uomApi.deleteUnidad,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uom-unidades'] }); message.success('Eliminada'); },
  });

  // Agrupar por tipo
  const tiposCount = Object.entries(
    (unidades ?? []).reduce((acc: any, u: any) => {
      acc[u.tipo] = (acc[u.tipo] || 0) + 1;
      return acc;
    }, {})
  );

  const cols = [
    { title: 'Código', dataIndex: 'codigo', width: 80, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'Símbolo', dataIndex: 'simbolo', width: 80, render: (v: string) => v ? <Text type="secondary">{v}</Text> : '—' },
    { title: 'Tipo', dataIndex: 'tipo', width: 120,
      render: (v: string) => <Tag color={TIPO_COLOR[v]}>{TIPO_LABEL[v] ?? v}</Tag> },
    { title: 'Base', dataIndex: 'esBase', width: 70, render: (v: boolean) => v ? <Tag color="blue">Base</Tag> : null },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar?" onConfirm={() => delMut.mutate(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ) },
  ];

  return (
    <>
      {(unidades ?? []).length === 0 && !isLoading && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="No hay unidades configuradas."
          description={
            <Button type="primary" size="small" icon={<ThunderboltOutlined />}
              loading={inicMut.isPending} onClick={() => inicMut.mutate()}>
              Inicializar catálogo estándar (KG, G, LB, L, ML, M, CM, PZA, DOC...)
            </Button>
          } />
      )}

      {(unidades ?? []).length > 0 && (
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
          {tiposCount.map(([tipo, count]) => (
            <Col key={tipo}>
              <Card size="small" style={{ minWidth: 100 }}>
                <Statistic title={TIPO_LABEL[tipo] ?? tipo} value={count as number}
                  suffix="uds." valueStyle={{ fontSize: 16 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Row justify="space-between" style={{ marginBottom: 12 }}>
        <Col>
          {(unidades ?? []).length > 0 && (
            <Button size="small" onClick={() => inicMut.mutate()} loading={inicMut.isPending}>
              Re-inicializar estándar
            </Button>
          )}
        </Col>
        <Col>
          <ColumnToggle columns={UOM_COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['uom']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
            Nueva unidad
          </Button>
        </Col>
      </Row>

      <Table columns={filterColumns(cols)} dataSource={unidades ?? []} rowKey="id" loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 20 }} />

      <Modal title="Nueva Unidad de Medida" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={460}>
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="KG" style={{ textTransform: 'uppercase' }} /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Kilogramo" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="simbolo" label="Símbolo"><Input placeholder="kg" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={Object.entries(TIPO_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="esBase" label="¿Es unidad base?" valuePropName="checked" initialValue={false}>
              <Select options={[{ value: false, label: 'No' }, { value: true, label: 'Sí (base del tipo)' }]} />
            </Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Conversiones ───────────────────────────────────────────────────────────
function ConversionesTab() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: unidades } = useQuery({ queryKey: ['uom-unidades'], queryFn: () => uomApi.unidades() });
  const { data: conversiones, isLoading } = useQuery({ queryKey: ['uom-conversiones'], queryFn: () => uomApi.conversiones() });

  const crearMut = useMutation({
    mutationFn: uomApi.crearConversion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uom-conversiones'] }); setOpen(false); form.resetFields(); message.success('Conversión creada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });
  const delMut = useMutation({
    mutationFn: uomApi.deleteConversion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uom-conversiones'] }); },
  });

  const unidadOpts = (unidades ?? []).map((u: any) => ({
    value: u.id, label: `${u.codigo} — ${u.nombre}`,
  }));

  const cols = [
    { title: 'Desde', key: 'desde', render: (_: any, r: any) =>
      <Text code>{r.unidadDesde?.codigo ?? '—'}</Text> },
    { title: 'Hasta', key: 'hasta', render: (_: any, r: any) =>
      <Text code>{r.unidadHasta?.codigo ?? '—'}</Text> },
    { title: 'Factor', dataIndex: 'factor', width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{Number(v).toFixed(6).replace(/\.?0+$/, '')}</Text> },
    { title: 'Ejemplo', key: 'ej', width: 160,
      render: (_: any, r: any) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          1 {r.unidadDesde?.codigo} = {Number(r.factor).toFixed(4).replace(/\.?0+$/, '')} {r.unidadHasta?.codigo}
        </Text>
      ) },
    { title: '', key: 'del', width: 50,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar conversión?" onConfirm={() => delMut.mutate(r.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ) },
  ];

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true); }}>
          Nueva conversión
        </Button>
      </Row>

      <Table columns={cols} dataSource={conversiones ?? []} rowKey="id" loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 30 }} />

      <Modal title="Nueva Conversión" open={open} onCancel={() => { setOpen(false); form.resetFields(); }} footer={null} width={440}>
        <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }}
          message="Define cuántas unidades destino equivalen a 1 unidad origen. Ej: 1 KG = 1000 G → factor = 1000" />
        <Form form={form} layout="vertical" onFinish={(v) => crearMut.mutate(v)}>
          <Form.Item name="unidadDesdeId" label="Unidad origen (1 de...)" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={unidadOpts} placeholder="ej. KG" />
          </Form.Item>
          <Form.Item name="unidadHastaId" label="Unidad destino (...equivale a N de)" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={unidadOpts} placeholder="ej. G" />
          </Form.Item>
          <Form.Item name="factor" label="Factor (N)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.00000001} precision={8} placeholder="1000" />
          </Form.Item>
          <Row justify="end" gutter={8}><Col><Button onClick={() => { setOpen(false); form.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col></Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab Calculadora ────────────────────────────────────────────────────────────
function CalculadoraTab() {
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const { data: unidades } = useQuery({ queryKey: ['uom-unidades'], queryFn: () => uomApi.unidades() });
  const unidadOpts = (unidades ?? []).map((u: any) => ({
    value: u.id, label: `${u.codigo} — ${u.nombre} (${u.simbolo ?? u.tipo})`,
  }));

  const convertir = async (v: any) => {
    setLoading(true);
    try {
      const r = await uomApi.convertir(v.cantidad, v.desdeId, v.hastaId);
      setResultado(r);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'No existe conversión directa');
      setResultado(null);
    } finally { setLoading(false); }
  };

  return (
    <Row justify="center">
      <Col xs={24} md={16} lg={12}>
        <Card title="Calculadora de Conversión" size="small">
          <Form form={form} layout="vertical" onFinish={convertir}>
            <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={4} placeholder="Ej: 5.5" onChange={() => setResultado(null)} />
            </Form.Item>
            <Row gutter={12} align="middle">
              <Col xs={24} sm={10}>
                <Form.Item name="desdeId" label="Unidad de origen" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" options={unidadOpts} onChange={() => setResultado(null)} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={4} style={{ textAlign: 'center', paddingTop: 28 }}>
                <SwapOutlined style={{ fontSize: 20, color: '#9E9E9E' }}  />
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item name="hastaId" label="Unidad de destino" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" options={unidadOpts} onChange={() => setResultado(null)} />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" htmlType="submit" block loading={loading} icon={<SwapOutlined />}>
              Convertir
            </Button>
          </Form>

          {resultado && (
            <>
              <Divider />
              <div style={{ textAlign: 'center' }}>
                <Text style={{ fontSize: 14, display: 'block' }}>
                  <Text style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 22, fontWeight: 700 }}>
                    {resultado.cantidad}
                  </Text>
                  <Text type="secondary"> {resultado.desde}</Text>
                </Text>
                <Text type="secondary" style={{ fontSize: 18, display: 'block', margin: '4px 0' }}>=</Text>
                <Text style={{ fontSize: 14, display: 'block' }}>
                  <Text style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 22, fontWeight: 700, color: '#1565C0' }}>
                    {resultado.resultado}
                  </Text>
                  <Text type="secondary"> {resultado.hasta}</Text>
                </Text>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                  Factor: {resultado.factor}
                </Text>
              </div>
            </>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function UomPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Unidades de Medida</Title>
      <Card>
        <Tabs defaultActiveKey="unidades" items={[
          { key: 'unidades',     label: 'Catálogo de Unidades', children: <UnidadesTab /> },
          { key: 'conversiones', label: 'Conversiones',          children: <ConversionesTab /> },
          { key: 'calculadora',  label: '⇄ Calculadora',         children: <CalculadoraTab /> },
        ]} />
      </Card>
    </div>
  );
}
