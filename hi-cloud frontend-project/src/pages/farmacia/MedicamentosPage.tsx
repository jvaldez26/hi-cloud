import { useState } from 'react';
import {
  Table, Button, Input, Modal, Form, InputNumber, Select, Switch,
  Space, Tag, Typography, Tooltip, Divider, message,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, MedicineBoxOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { farmaciaApi } from '../../api/farmacia.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const { Title } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'nombreGenerico', label: 'Nombre Genérico', defaultVisible: true },
  { key: 'nombreComercial', label: 'Nombre Comercial', defaultVisible: false },
  { key: 'concentracion', label: 'Concentración', defaultVisible: true },
  { key: 'forma', label: 'Forma', defaultVisible: true },
  { key: 'categoria', label: 'Categoría', defaultVisible: true },
  { key: 'stockActual', label: 'Stock', defaultVisible: true },
  { key: 'precioVenta', label: 'Precio Venta', defaultVisible: true },
  { key: 'requiereReceta', label: 'Receta', defaultVisible: false },
  { key: 'esNarcotico', label: 'Narc.', defaultVisible: false },
  { key: 'actions', label: 'Acciones', defaultVisible: true },
];

const CATEGORIAS = ['Analgésico', 'Antibiótico', 'Antihipertensivo', 'Antidiabético', 'Antiinflamatorio', 'Vitamina', 'Gastrointestinal', 'Respiratorio', 'Dermatológico', 'Otro'];
const FORMAS = ['Tableta', 'Cápsula', 'Jarabe', 'Suspensión', 'Inyectable', 'Crema', 'Gotas', 'Supositorio', 'Parche', 'Inhalador'];
const VIAS = ['Oral', 'Intravenosa', 'Intramuscular', 'Subcutánea', 'Tópica', 'Inhalatoria', 'Rectal', 'Sublingual'];

export default function MedicamentosPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('farmacia-medicamentos', COLS_DEF);

  const { data, isLoading } = useQuery({
    queryKey: ['farmacia-medicamentos', page, search, categoria],
    queryFn: () => farmaciaApi.medicamentos({ page, limit: 20, search: search || undefined, categoria }),
  });

  const crear = useMutation({
    mutationFn: (b: any) => editId ? farmaciaApi.actualizarMedicamento(editId, b) : farmaciaApi.crearMedicamento(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['farmacia-medicamentos'] });
      setModalOpen(false);
      form.resetFields();
      setEditId(null);
    },
  });

  const abrirEditar = async (id: number) => {
    const m = await farmaciaApi.medicamento(id);
    setEditId(id);
    form.setFieldsValue(m);
    setModalOpen(true);
  };

  const columns = [
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 90 },
    { title: 'Nombre Genérico', dataIndex: 'nombreGenerico', key: 'nombreGenerico', ellipsis: true },
    { title: 'Nombre Comercial', dataIndex: 'nombreComercial', key: 'nombreComercial', ellipsis: true },
    { title: 'Concentración', dataIndex: 'concentracion', key: 'concentracion', width: 120 },
    { title: 'Forma', dataIndex: 'forma', key: 'forma', width: 100 },
    { title: 'Categoría', dataIndex: 'categoria', key: 'categoria', width: 130 },
    { title: 'Stock', dataIndex: 'stockActual', key: 'stockActual', width: 80, render: (v: number, r: any) => {
      const color = v === 0 ? 'error' : v <= r.stockMinimo ? 'warning' : 'success';
      return <Tag color={color}>{v}</Tag>;
    }},
    { title: 'Precio Venta', dataIndex: 'precioVenta', key: 'precioVenta', width: 110, render: (v: number) => `RD$ ${Number(v ?? 0).toFixed(2)}` },
    { title: 'Receta', dataIndex: 'requiereReceta', key: 'requiereReceta', width: 70, render: (v: boolean) => v ? <Tag color="orange">Sí</Tag> : null },
    { title: 'Narc.', dataIndex: 'esNarcotico', key: 'esNarcotico', width: 65, render: (v: boolean) => v ? <Tag color="red">Sí</Tag> : null },
    {
      title: '', key: 'actions', width: 50,
      render: (_: any, r: any) => (
        <Tooltip title="Editar">
          <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r.id)} />
        </Tooltip>
      ),
    },
  ];

  const exportar = () => {
    const filas = (data?.data ?? []).map((r: any) => ({
      'Código': r.codigo,
      'Nombre Genérico': r.nombreGenerico,
      'Nombre Comercial': r.nombreComercial ?? '',
      'Concentración': r.concentracion ?? '',
      'Forma': r.forma ?? '',
      'Categoría': r.categoria ?? '',
      'Stock': r.stockActual,
      'Precio Venta': r.precioVenta,
      'Requiere Receta': r.requiereReceta ? 'Sí' : 'No',
      'Narcótico': r.esNarcotico ? 'Sí' : 'No',
    }));
    exportarExcel(filas, `Medicamentos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          <MedicineBoxOutlined style={{ marginRight: 8 }} />Medicamentos
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['farmacia-medicamentos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setModalOpen(true); }}>
            Nuevo Medicamento
          </Button>
        </div>
      </div>

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="Buscar por nombre, código..."
          style={{ width: 280 }}
          prefix={<SearchOutlined />}
          onSearch={v => { setSearch(v); setPage(1); }}
          allowClear
        />
        <Select placeholder="Categoría" style={{ width: 160 }} allowClear onChange={v => { setCategoria(v); setPage(1); }}>
          {CATEGORIAS.map(c => <Option key={c} value={c}>{c}</Option>)}
        </Select>
      </Space>

      <Table
        dataSource={data?.data ?? []}
        columns={filterColumns(columns as any)}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize: 10, total: data?.total ?? 0,
          onChange: setPage, showSizeChanger: false,
          showTotal: (t) => `${t} medicamentos`,
        }}
      />

      <Modal
        open={modalOpen}
        title={editId ? 'Editar Medicamento' : 'Nuevo Medicamento'}
        onCancel={() => { setModalOpen(false); setEditId(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crear.mutate(v))}
        confirmLoading={crear.isPending}
        width={780}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Divider orientation="left" plain>Identificación</Divider>
          <Form.Item name="nombreGenerico" label="Nombre Genérico" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nombreComercial" label="Nombre Comercial">
            <Input />
          </Form.Item>
          <Space size={12} wrap style={{ width: '100%' }}>
            <Form.Item name="codigo" label="Código interno" style={{ width: 150 }}>
              <Input />
            </Form.Item>
            <Form.Item name="codigoBarra" label="Código de Barra" style={{ width: 200 }}>
              <Input />
            </Form.Item>
            <Form.Item name="laboratorio" label="Laboratorio" style={{ width: 200 }}>
              <Input />
            </Form.Item>
          </Space>

          <Divider orientation="left" plain>Clasificación</Divider>
          <Space size={12} wrap style={{ width: '100%' }}>
            <Form.Item name="categoria" label="Categoría" style={{ width: 160 }}>
              <Select allowClear>{CATEGORIAS.map(c => <Option key={c} value={c}>{c}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="forma" label="Forma Farmacéutica" style={{ width: 160 }}>
              <Select allowClear>{FORMAS.map(f => <Option key={f} value={f}>{f}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="concentracion" label="Concentración" style={{ width: 160 }}>
              <Input placeholder="ej: 500mg" />
            </Form.Item>
            <Form.Item name="via" label="Vía de Admin." style={{ width: 160 }}>
              <Select allowClear>{VIAS.map(v => <Option key={v} value={v}>{v}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="unidadMedida" label="Unidad Medida" style={{ width: 140 }}>
              <Input placeholder="ej: Caja x30" />
            </Form.Item>
          </Space>

          <Divider orientation="left" plain>Precios y Stock</Divider>
          <Space size={12} wrap style={{ width: '100%' }}>
            <Form.Item name="precioCompra" label="Precio Compra" style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
            </Form.Item>
            <Form.Item name="precioVenta" label="Precio Venta" style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
            </Form.Item>
            <Form.Item name="precioArs" label="Precio ARS" style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={0} prefix="RD$" precision={2} />
            </Form.Item>
            <Form.Item name="margenGanancia" label="Margen %" style={{ width: 130 }}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} />
            </Form.Item>
            <Form.Item name="stockMinimo" label="Stock Mínimo" style={{ width: 130 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
            <Form.Item name="stockMaximo" label="Stock Máximo" style={{ width: 130 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Space>

          <Divider orientation="left" plain>Enlace ERP (opcional)</Divider>
          <Form.Item name="productoId" label="Producto ERP (ID)">
            <InputNumber style={{ width: 160 }} min={1} placeholder="ID del producto en ERP" />
          </Form.Item>

          <Divider orientation="left" plain>Controles</Divider>
          <Space size={24} wrap>
            <Form.Item name="requiereReceta" valuePropName="checked" label="Requiere Receta">
              <Switch />
            </Form.Item>
            <Form.Item name="esNarcotico" valuePropName="checked" label="Narcótico">
              <Switch />
            </Form.Item>
            <Form.Item name="esPsicotropico" valuePropName="checked" label="Psicotrópico">
              <Switch />
            </Form.Item>
            <Form.Item name="esRefrigerado" valuePropName="checked" label="Refrigerado">
              <Switch />
            </Form.Item>
            {editId && (
              <Form.Item name="isActive" valuePropName="checked" label="Activo">
                <Switch />
              </Form.Item>
            )}
          </Space>
        </Form>
      </Modal>
    </div>
  );
}

