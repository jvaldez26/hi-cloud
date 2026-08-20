import { useState } from 'react';
import {
  Table, Button, Input, Modal, Form, InputNumber, Select, Switch,
  Space, Tag, Typography, Tabs, message,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'categoriaNombre', label: 'Categoría', defaultVisible: true },
  { key: 'precio', label: 'Precio', defaultVisible: true },
  { key: 'costo', label: 'Costo', defaultVisible: false },
  { key: 'tiempoPreparacionMin', label: 'Min', defaultVisible: false },
  { key: 'disponible', label: 'Disponible', defaultVisible: true },
  { key: 'disponibleParaDelivery', label: 'Delivery', defaultVisible: true },
  { key: 'act', label: 'Acciones', defaultVisible: true },
];

export default function MenuPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [catFiltro, setCatFiltro] = useState<number | undefined>();
  const [modalItem, setModalItem] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [modalCat, setModalCat] = useState(false);
  const [form] = Form.useForm();
  const [formCat] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('restaurante-menu', COLS_DEF);

  const { data: categorias = [] } = useQuery({
    queryKey: ['restaurante-categorias'],
    queryFn: restauranteApi.listarCategorias,
  });

  const { data: menu = [], isLoading } = useQuery({
    queryKey: ['restaurante-menu-admin', catFiltro, search],
    queryFn: () => restauranteApi.listarMenu({ categoriaId: catFiltro, search: search || undefined }),
  });

  const guardarItem = useMutation({
    mutationFn: (b: any) => editId ? restauranteApi.actualizarMenuItem(editId, b) : restauranteApi.crearMenuItem(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-menu-admin'] }); setModalItem(false); form.resetFields(); setEditId(null); message.success('Guardado'); },
    onError: () => message.error('Error al guardar'),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => restauranteApi.toggleDisponibilidad(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['restaurante-menu-admin'] }),
    onError: () => message.error('Error'),
  });

  const guardarCat = useMutation({
    mutationFn: (b: any) => restauranteApi.crearCategoria(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-categorias'] }); setModalCat(false); formCat.resetFields(); message.success('Categoría creada'); },
    onError: () => message.error('Error'),
  });

  const abrirEditar = async (id: number) => {
    const item = await restauranteApi.obtenerMenuItem(id);
    setEditId(id); form.setFieldsValue(item); setModalItem(true);
  };

  const colsMenu = [
    { title: 'Código', dataIndex: 'codigo', width: 80, render: (v: string) => v ?? '—' },
    { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
    { title: 'Categoría', dataIndex: 'categoriaNombre', width: 130 },
    { title: 'Precio', dataIndex: 'precio', width: 100, render: (v: number) => `RD$${Number(v).toFixed(2)}` },
    { title: 'Costo', dataIndex: 'costo', width: 90, render: (v: number) => v ? `RD$${Number(v).toFixed(2)}` : '—' },
    { title: '⏱ Min', dataIndex: 'tiempoPreparacionMin', width: 70 },
    {
      title: 'Disponible', dataIndex: 'disponible', width: 100,
      render: (v: boolean, r: any) => (
        <Switch size="small" checked={v} onChange={() => toggle.mutate(r.id)} />
      ),
    },
    { title: 'Delivery', dataIndex: 'disponibleParaDelivery', width: 80, render: (v: boolean) => v ? <Tag color="green">Sí</Tag> : <Tag>No</Tag> },
    {
      title: '', key: 'act', width: 50,
      render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r.id)} />,
    },
  ];

  const exportar = () => {
    const filas = (menu as any[]).map((r: any) => ({
      'Código': r.codigo ?? '',
      'Nombre': r.nombre ?? '',
      'Categoría': r.categoriaNombre ?? '',
      'Precio': r.precio ?? 0,
      'Costo': r.costo ?? 0,
      'Disponible': r.disponible ? 'Sí' : 'No',
      'Delivery': r.disponibleParaDelivery ? 'Sí' : 'No',
    }));
    exportarExcel(filas, `Menu-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>🍴 Gestión del Menú</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['restaurante-menu-admin']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button icon={<PlusOutlined />} onClick={() => setModalCat(true)}>Nueva Categoría</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalItem(true); }}>Nuevo Ítem</Button>
        </div>
      </div>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          placeholder="Buscar plato..."
          prefix={<SearchOutlined />}
          style={{ width: 240 }}
          onSearch={v => setSearch(v)}
          allowClear
        />
        <Select placeholder="Categoría" style={{ width: 160 }} allowClear onChange={v => setCatFiltro(v as number)}>
          {(categorias as any[]).map((c: any) => <Option key={c.id} value={c.id}>{c.nombre} ({c.numItems})</Option>)}
        </Select>
      </Space>

      <Table
        dataSource={menu as any[]}
        columns={filterColumns(colsMenu as any)}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10 }}
      />

      {/* Modal Ítem */}
      <Modal
        open={modalItem}
        title={editId ? 'Editar ítem' : 'Nuevo ítem del menú'}
        onCancel={() => { setModalItem(false); form.resetFields(); setEditId(null); }}
        onOk={() => form.validateFields().then(vals => guardarItem.mutate(vals))}
        confirmLoading={guardarItem.isPending}
        width={600}
        okText="Guardar"
      >
        <Form form={form} layout="vertical" size="small" initialValues={{ disponible: true, disponibleParaDelivery: true, tiempoPreparacionMin: 15, esVegetariano: false, esVegano: false, esGlutenFree: false }}>
          <Form.Item name="categoriaId" label="Categoría" rules={[{ required: true }]}>
            <Select>
              {(categorias as any[]).map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
          <Space style={{ width: '100%' }} direction="horizontal">
            <Form.Item name="precio" label="Precio (RD$)" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="costo" label="Costo (RD$)" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="tiempoPreparacionMin" label="⏱ Min" style={{ flex: 1 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="disponible" label="Disponible" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="disponibleParaDelivery" label="Delivery" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="esVegetariano" label="Vegetariano" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="esVegano" label="Vegano" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="esGlutenFree" label="Sin Gluten" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Form.Item name="alergenos" label="Alérgenos"><Input placeholder="gluten, lactosa, mariscos..." /></Form.Item>
          <Form.Item name="calorias" label="Calorías"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal Categoría */}
      <Modal
        open={modalCat}
        title="Nueva Categoría"
        onCancel={() => setModalCat(false)}
        onOk={() => formCat.validateFields().then(vals => guardarCat.mutate(vals))}
        confirmLoading={guardarCat.isPending}
        okText="Crear"
      >
        <Form form={formCat} layout="vertical" size="small" initialValues={{ orden: 0 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="icono" label="Ícono (emoji)"><Input placeholder="🍖 🥗 🍹" maxLength={10} /></Form.Item>
          <Form.Item name="color" label="Color (hex)"><Input placeholder="#f59e0b" /></Form.Item>
          <Form.Item name="orden" label="Orden"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

