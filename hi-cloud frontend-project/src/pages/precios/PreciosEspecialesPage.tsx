import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { Card, Table, Button, Tag, Row, Col, Typography, Modal, Form,
         InputNumber, Select, Input, DatePicker, Space, Popconfirm, message, Alert, theme } from 'antd';
import { PlusOutlined, DeleteOutlined, PercentageOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { productosApi } from '../../api/productos.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const TIERS = [
  { value: 'mayorista',    label: '🏭 Mayorista' },
  { value: 'minorista',    label: '🛒 Minorista' },
  { value: 'vip',          label: '⭐ VIP' },
  { value: 'especial',     label: '🎯 Especial' },
  { value: 'distribuidor', label: '📦 Distribuidor' },
];

const preciosApi = {
  listar:   (filtro: any) => api.get(`/precios?${new URLSearchParams(filtro).toString()}`).then(r => r.data?.data ?? r.data),
  crear:    (body: any)   => api.post('/precios', body).then(r => r.data?.data ?? r.data),
  eliminar: (id: number)  => api.delete(`/precios/${id}`).then(r => r.data?.data ?? r.data),
  calcular: (productoId: number, clienteId?: number) =>
    api.get(`/precios/calcular?productoId=${productoId}${clienteId ? `&clienteId=${clienteId}` : ''}`).then(r => r.data?.data ?? r.data),
};

export default function PreciosEspecialesPage() {
  const { token } = theme.useToken();
  const [open,   setOpen]   = useState(false);
  const [tipo,   setTipo]   = useState<'cliente' | 'tier' | 'global'>('global');
  const [search, setSearch] = useState('');
  const [form]              = Form.useForm();
  const qc = useQueryClient();

  const { data: lista, isLoading } = useQuery({ queryKey: ['precios-especiales'], queryFn: () => preciosApi.listar({}) });
  const { data: clientes } = useQuery({ queryKey: ['clientes-prec'], queryFn: () => clientesApi.list(1, 100) });
  const { data: productos } = useQuery({ queryKey: ['productos-prec'], queryFn: () => productosApi.list(1, 200) });

  const crearMut = useMutation({
    mutationFn: preciosApi.crear,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios-especiales'] }); setOpen(false); form.resetFields(); message.success('Precio especial creado'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: preciosApi.eliminar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios-especiales'] }); message.success('Eliminado'); },
  });

  const listaFiltrada = useMemo(() => {
    if (!search.trim()) return lista ?? [];
    const q = search.toLowerCase();
    return (lista ?? []).filter((r: any) => {
      const prod = productos?.data?.find((x: any) => x.id === r.productoId);
      const cli  = clientes?.data?.find((x: any) => x.id === r.clienteId);
      return (
        prod?.nombre?.toLowerCase().includes(q) ||
        prod?.codigo?.toLowerCase().includes(q) ||
        cli?.nombre?.toLowerCase().includes(q) ||
        String(r.tier ?? '').toLowerCase().includes(q)
      );
    });
  }, [lista, search, productos, clientes]);

  const cols = [
    { title: 'Producto', key: 'prod', ellipsis: true,
      render: (_: any, r: any) => {
        const p = productos?.data.find((x: any) => x.id === r.productoId);
        return p ? (p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre) : `#${r.productoId}`;
      }},
    { title: 'Aplica a', key: 'aplica', width: 140,
      render: (_: any, r: any) => {
        if (r.clienteId) {
          const c = clientes?.data.find((x: any) => x.id === r.clienteId);
          return <Tag color="blue">{c?.nombre ?? `Cliente #${r.clienteId}`}</Tag>;
        }
        if (r.tier) return <Tag color="purple">{TIERS.find(t => t.value === r.tier)?.label ?? r.tier}</Tag>;
        return <Tag color="green">Global (todos)</Tag>;
      }},
    { title: 'Precio fijo', dataIndex: 'precioFijo', width: 120,
      render: (v: number) => v != null ? fmt.money(v) : '—' },
    { title: 'Descuento', dataIndex: 'descuentoPorcentaje', width: 90,
      render: (v: number) => v != null ? `${v}%` : '—' },
    { title: 'Vigencia', key: 'vig', width: 180,
      render: (_: any, r: any) => {
        const desde = r.vigenciaDesde ? fmt.date(r.vigenciaDesde) : '∞';
        const hasta = r.vigenciaHasta ? fmt.date(r.vigenciaHasta) : '∞';
        return <Text style={{ fontSize: 12 }}>{desde} → {hasta}</Text>;
      }},
    { title: '', key: 'del', width: 60,
      render: (_: any, r: any) => (
        <Popconfirm title="¿Eliminar?" onConfirm={() => eliminarMut.mutate(r.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 8 }}>Listas de Precios Especiales</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Define precios mayoristas, por cliente específico, por tier o descuentos globales.
      </Text>

      <Card extra={
        <Space wrap>
          <Input
            placeholder="Buscar por producto, cliente o tier..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (lista ?? []).map((p: any) => ({
              'Producto':  p.producto?.nombre ?? p.productoNombre ?? '',
              'Cliente':   p.cliente?.nombre  ?? p.clienteNombre  ?? 'Global',
              'Tipo':      p.tipo ?? '',
              'Precio/Desc': p.tipo === 'porcentaje' ? `${p.valor}%` : `RD$ ${Number(p.precio ?? p.valor ?? 0)}`,
              'Desde':     p.fechaDesde ?? '',
              'Hasta':     p.fechaHasta ?? 'Sin límite',
              'Activo':    p.activo !== false ? 'Sí' : 'No',
            }));
            exportarExcel(filas, 'Precios-Especiales');
          }}>Excel</Button>
          <RefreshByKeyButton queryKey={['precios-especiales']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); setTipo('global'); form.resetFields(); }}>
            Nuevo precio especial
          </Button>
        </Space>
      }>
        <Table columns={cols} dataSource={listaFiltrada} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 15, showSizeChanger: false }} />
      </Card>

      <Modal title="Nuevo Precio Especial" open={open} onCancel={() => setOpen(false)} footer={null} width={560}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Prioridad: Cliente específico > Tier > Global. El sistema aplica el precio más específico disponible." />

        {/* Tipo de regla */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { key: 'cliente', label: '👤 Por cliente' },
            { key: 'tier',    label: '🏷️ Por tier' },
            { key: 'global',  label: '🌍 Global' },
          ].map(t => (
            <Button key={t.key} type={tipo === t.key ? 'primary' : 'default'}
              size="small" onClick={() => setTipo(t.key as any)}>
              {t.label}
            </Button>
          ))}
        </div>

        <Form form={form} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
                <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                  options={productos?.data.map((p: any) => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre} (${fmt.money(p.precio)})` : `${p.nombre} (${fmt.money(p.precio)})` }))} />
              </Form.Item>
            </Col>

            {tipo === 'cliente' && (
              <Col span={24}>
                <Form.Item name="clienteId" label="Cliente específico" rules={[{ required: true }]}>
                  <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                    options={clientes?.data.map((c: any) => ({ value: c.id, label: `${c.rfc} — ${c.nombre}` }))} />
                </Form.Item>
              </Col>
            )}

            {tipo === 'tier' && (
              <Col span={24}>
                <Form.Item name="tier" label="Tier de precio" rules={[{ required: true }]}>
                  <Select options={TIERS} />
                </Form.Item>
              </Col>
            )}

            <Col xs={24} sm={12}>
              <Form.Item name="precioFijo" label="Precio fijo (RD$)" tooltip="Deja vacío si usas % descuento">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="descuentoPorcentaje" label="O descuento (%)" tooltip="Se aplica sobre el precio base">
                <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2}
                  formatter={v => `${v}%`} parser={v => Number(String(v ?? '').replace('%','')) as 0 | 100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="nombre" label="Nombre de la regla"><Input placeholder="Precio mayorista..." /></Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="vigenciaDesde" label="Vigente desde"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="vigenciaHasta" label="Vigente hasta"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Guardar precio</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
