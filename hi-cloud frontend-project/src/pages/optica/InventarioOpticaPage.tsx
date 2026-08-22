import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Tag, Tabs, Statistic,
  Tooltip, Popconfirm,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, PlusCircleOutlined, MinusCircleOutlined,
  WarningOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import { hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const TIPO_OPS = [
  { value: 'montura',       label: 'Montura'         },
  { value: 'lente_contacto', label: 'Lente de contacto' },
  { value: 'accesorio',     label: 'Accesorio'       },
];
const TIPO_COLOR: Record<string, string> = {
  montura: 'blue', lente_contacto: 'purple', accesorio: 'cyan',
};
const GENERO_OPS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino',  label: 'Femenino'  },
  { value: 'unisex',    label: 'Unisex'    },
];

const COLS_DEF = [
  { key: 'tipo', label: 'Tipo', defaultVisible: true },
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'marca', label: 'Marca', defaultVisible: true },
  { key: 'modelo', label: 'Modelo', defaultVisible: true },
  { key: 'color', label: 'Color', defaultVisible: false },
  { key: 'material', label: 'Material', defaultVisible: false },
  { key: 'precio', label: 'Precio', defaultVisible: true },
  { key: 'stockActual', label: 'Stock', defaultVisible: true },
  { key: 'acc', label: 'Acciones', defaultVisible: true },
];

// ── Modal ajuste stock ────────────────────────────────────────────────────────

function AjusteStockModal({ open, item, onClose, onSuccess }: any) {
  const [form] = Form.useForm();
  const ajusteMut = useMutation({
    mutationFn: (v: any) => opticaApi.ajustarStock(item.id, v.delta, v.motivo),
    onSuccess: () => {
      message.success('Stock actualizado');
      form.resetFields();
      onSuccess();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al ajustar stock');
    },
  });

  return (
    <Modal title={`Ajustar stock — ${item?.marca ?? ''} ${item?.modelo ?? ''}`}
      open={open} onCancel={onClose} footer={null} width={360}
    >
      <Form form={form} layout="vertical" onFinish={(v) => ajusteMut.mutate(v)}>
        <Form.Item name="delta" label="Cantidad a agregar/restar" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="motivo" label="Motivo">
          <Input placeholder="Compra, ajuste, venta..." />
        </Form.Item>
        <Row justify="end" gutter={8}>
          <Col><Button onClick={onClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={ajusteMut.isPending}>
              Aplicar
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Modal crear/editar ────────────────────────────────────────────────────────

function ItemModal({ open, editing, onClose, onSuccess }: any) {
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const saveMut = useMutation({
    mutationFn: (v: any) =>
      editing ? opticaApi.actualizarInventario(editing.id, v) : opticaApi.crearInventario(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-inventario'] });
      qc.invalidateQueries({ queryKey: ['optica-inventario-resumen'] });
      message.success(editing ? 'Ítem actualizado' : 'Ítem creado');
      form.resetFields();
      onSuccess();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar ítem');
    },
  });

  const onOpen = () => {
    if (editing) form.setFieldsValue(editing);
    else form.resetFields();
    form.setFieldValue('tipo', form.getFieldValue('tipo') ?? 'montura');
  };

  return (
    <Modal
      title={editing ? 'Editar ítem' : 'Nuevo ítem de inventario'}
      open={open} onCancel={onClose} footer={null} width={600}
      afterOpenChange={v => v && onOpen()}
    >
      <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}
        initialValues={{ tipo: 'montura' }}
      >
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={TIPO_OPS} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="codigo" label="Código / SKU">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="marca" label="Marca">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="modelo" label="Modelo">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="color" label="Color">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="material" label="Material">
              <Input placeholder="Acetato, metal..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="genero" label="Género">
              <Select options={GENERO_OPS} allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="costo" label="Costo">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="precio" label="Precio venta">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={4}>
            <Form.Item name="stockActual" label="Stock">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={4}>
            <Form.Item name="stockMinimo" label="Mín.">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="descripcion" label="Descripción">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row justify="end" gutter={8}>
          <Col><Button onClick={onClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function InventarioOpticaPage() {
  const { token } = theme.useToken();
  const [search, setSearch]     = useState('');
  const [filtroTipo, setFiltro] = useState<string | undefined>(undefined);
  const [openCreate, setCreate] = useState(false);
  const [editing, setEditing]   = useState<any>(null);
  const [ajusteItem, setAjuste] = useState<any>(null);
  const qc = useQueryClient();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('optica-inventario', COLS_DEF);

  const { data: inventarioData, isLoading } = useQuery({
    queryKey: ['optica-inventario', filtroTipo, search],
    queryFn: () => opticaApi.inventario({ limit: 200, tipo: filtroTipo, search: search || undefined }),
  });
  const { data: resumenData } = useQuery({
    queryKey: ['optica-inventario-resumen'],
    queryFn: () => opticaApi.inventarioResumen(),
    staleTime: 30_000,
  });

  const items   = (inventarioData?.data ?? inventarioData ?? []) as any[];
  const resumen = (resumenData ?? []) as any[];

  const eliminarMut = useMutation({
    mutationFn: (id: number) => opticaApi.eliminarInventario(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-inventario'] });
      qc.invalidateQueries({ queryKey: ['optica-inventario-resumen'] });
      message.success('Ítem dado de baja');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al dar de baja ítem');
    },
  });

  const cols = [
    {
      title: 'Tipo', dataIndex: 'tipo', width: 120,
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? 'default'}>{TIPO_OPS.find(o => o.value === v)?.label ?? v}</Tag>,
    },
    { title: 'Código', dataIndex: 'codigo', width: 90, render: (v: any) => v ?? '—' },
    { title: 'Marca',  dataIndex: 'marca',  width: 120, render: (v: any) => v ?? '—' },
    { title: 'Modelo', dataIndex: 'modelo', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Color',  dataIndex: 'color',  width: 90,  render: (v: any) => v ?? '—' },
    { title: 'Material', dataIndex: 'material', width: 100, render: (v: any) => v ?? '—' },
    {
      title: 'Precio', dataIndex: 'precio', width: 100, align: 'right' as const,
      render: (v: any) => fmt.money(v ?? 0),
    },
    {
      title: 'Stock', dataIndex: 'stockActual', width: 80, align: 'center' as const,
      render: (v: number, r: any) => (
        <Text style={{ color: v <= r.stockMinimo ? '#f5222d' : undefined }} strong={v <= r.stockMinimo}>
          {v <= r.stockMinimo && <WarningOutlined style={{ marginRight: 4 }} />}
          {v}
        </Text>
      ),
    },
    {
      title: '', key: 'acc', width: 110, align: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tooltip title="Ajustar stock">
            <Button size="small" icon={<PlusCircleOutlined />} type="link"
              onClick={() => setAjuste(r)} />
          </Tooltip>
          <Tooltip title="Editar">
            <Button size="small" icon={<EditOutlined />} type="link"
              onClick={() => { setEditing(r); setCreate(true); }} />
          </Tooltip>
          <Popconfirm
            title="¿Dar de baja este ítem?"
            onConfirm={() => eliminarMut.mutate(r.id)}
            okText="Sí" cancelText="No"
          >
            <Button size="small" icon={<DeleteOutlined />} type="link" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const exportar = () => {
    const filas = items.map((r: any) => ({
      'Tipo': TIPO_OPS.find(o => o.value === r.tipo)?.label ?? r.tipo ?? '',
      'Código': r.codigo ?? '',
      'Marca': r.marca ?? '',
      'Modelo': r.modelo ?? '',
      'Color': r.color ?? '',
      'Material': r.material ?? '',
      'Precio': r.precio ?? 0,
      'Stock': r.stockActual ?? 0,
    }));
    exportarExcel(filas, `Inventario-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Inventario Óptico</Title>

      {/* Resumen por tipo */}
      {resumen.length > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {resumen.map((r: any) => (
            <Col xs={12} sm={6} key={r.tipo}>
              <Card size="small">
                <Statistic
                  title={TIPO_OPS.find(o => o.value === r.tipo)?.label ?? r.tipo}
                  value={r.stockTotal}
                  suffix={<Text type="secondary" style={{ fontSize: 12 }}>uds · {fmt.money(r.valorInventario)}</Text>}
                  valueStyle={r.bajosStock > 0 ? { color: '#f5222d' } : undefined}
                />
                {r.bajosStock > 0 && (
                  <Text type="danger" style={{ fontSize: 11 }}>
                    <WarningOutlined /> {r.bajosStock} bajo stock mínimo
                  </Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <Input
              placeholder="Buscar marca, modelo, código..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search} onChange={e => setSearch(e.target.value)}
              allowClear style={{ width: 240 }}
            />
            <Select
              placeholder="Tipo" allowClear value={filtroTipo}
              onChange={v => setFiltro(v)} options={TIPO_OPS} style={{ width: 160 }}
            />
          </Space>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['optica-inventario']} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); setCreate(true); }}>
              Nuevo ítem
            </Button>
          </div>
        </div>

        <Table
          columns={filterColumns(cols as any)} dataSource={items} rowKey="id"
          loading={isLoading} size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10 }}
          rowClassName={(r: any) => r.stockActual <= r.stockMinimo ? 'ant-table-row-danger' : ''}
        />
      </Card>

      <ItemModal
        open={openCreate} editing={editing}
        onClose={() => { setCreate(false); setEditing(null); }}
        onSuccess={() => { setCreate(false); setEditing(null); }}
      />

      {ajusteItem && (
        <AjusteStockModal
          open={!!ajusteItem} item={ajusteItem}
          onClose={() => setAjuste(null)}
          onSuccess={() => {
            setAjuste(null);
            qc.invalidateQueries({ queryKey: ['optica-inventario'] });
            qc.invalidateQueries({ queryKey: ['optica-inventario-resumen'] });
          }}
        />
      )}
    </div>
  );
}

