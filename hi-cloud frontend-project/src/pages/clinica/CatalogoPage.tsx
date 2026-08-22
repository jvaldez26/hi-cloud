import { useState } from 'react';
import { Table, Button, Space, Tag, Typography, Modal, Form, Select, Input, InputNumber, message, Switch } from 'antd';
import { PlusOutlined, EditOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';
const fmtMoney = (v: any) => fmtObj.money(v);

const { Title } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'nombre', label: 'Nombre', defaultVisible: true },
  { key: 'especialidad', label: 'Especialidad', defaultVisible: true },
  { key: 'precio', label: 'Precio', defaultVisible: true },
  { key: 'precioArs', label: 'Precio ARS', defaultVisible: false },
  { key: 'duracionMinutos', label: 'Duración', defaultVisible: false },
  { key: 'requiereAutorizacion', label: 'Req. Autorización', defaultVisible: true },
  { key: 'isActive', label: 'Estado', defaultVisible: true },
  { key: 'act', label: 'Acciones', defaultVisible: true },
];

const ESPECIALIDADES = [
  'Medicina General','Medicina Interna','Pediatría','Cardiología','Dermatología',
  'Endocrinología','Gastroenterología','Ginecología','Neurología','Ortopedia',
  'Laboratorio','Radiología','Cirugía',
];

export default function CatalogoPage() {
  const qc = useQueryClient();
  const [especialidad, setEspecialidad] = useState<string | undefined>();
  const [modal, setModal] = useState<'crear' | 'editar' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('clinica-catalogo', COLS_DEF);

  const { data = [], isLoading } = useQuery({
    queryKey: ['clinica-catalogo', especialidad],
    queryFn: () => clinicaApi.listarCatalogo({ especialidad }),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearCatalogo(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-catalogo'] }); setModal(null); message.success('Servicio creado'); },
    onError: () => message.error('Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarCatalogo(selected?.id, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-catalogo'] }); setModal(null); message.success('Actualizado'); },
    onError: () => message.error('Error'),
  });

  const openEditar = (r: any) => { setSelected(r); form.setFieldsValue(r); setModal('editar'); };

  const exportar = () => {
    const filas = (data ?? []).map((r: any) => ({
      'Código': r.codigo ?? '',
      'Nombre': r.nombre,
      'Especialidad': r.especialidad ?? '',
      'Precio': r.precio ?? '',
      'Precio ARS': r.precioArs ?? '',
      'Duración (min)': r.duracionMinutos ?? 30,
      'Req. Autorización': r.requiereAutorizacion ? 'Sí' : 'No',
      'Estado': r.isActive !== false ? 'Activo' : 'Inactivo',
    }));
    exportarExcel(filas, `Catalogo-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const cols = [
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 100, render: (v: any) => v ?? '—' },
    { title: 'Nombre', dataIndex: 'nombre', key: 'nombre', ellipsis: true },
    { title: 'Especialidad', dataIndex: 'especialidad', key: 'especialidad', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Precio', dataIndex: 'precio', key: 'precio', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Precio ARS', dataIndex: 'precioArs', key: 'precioArs', width: 110, render: (v: any) => v ? fmtMoney(v) : '—' },
    { title: 'Duración', dataIndex: 'duracionMinutos', key: 'duracionMinutos', width: 90, render: (v: any) => `${v ?? 30} min` },
    {
      title: 'Req. Autorización', dataIndex: 'requiereAutorizacion', key: 'requiereAutorizacion', width: 130,
      render: (v: boolean) => v ? <Tag color="orange">Sí</Tag> : <Tag color="green">No</Tag>,
    },
    {
      title: 'Estado', dataIndex: 'isActive', key: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v !== false ? 'green' : 'default'}>{v !== false ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 80,
      render: (_: any, r: any) => <Button icon={<EditOutlined />} size="small" onClick={() => openEditar(r)} />,
    },
  ];

  const CatForm = () => (
    <>
      <Form.Item name="codigo" label="Código"><Input /></Form.Item>
      <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="especialidad" label="Especialidad">
        <Select showSearch allowClear>
          {ESPECIALIDADES.map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="precio" label="Precio (RD$)">
        <InputNumber style={{ width: '100%' }} min={0} step={100} />
      </Form.Item>
      <Form.Item name="precioArs" label="Precio ARS (RD$)">
        <InputNumber style={{ width: '100%' }} min={0} step={100} />
      </Form.Item>
      <Form.Item name="duracionMinutos" label="Duración (min)">
        <Select>{[10,15,20,30,45,60,90,120].map(d => <Option key={d} value={d}>{d} min</Option>)}</Select>
      </Form.Item>
      <Form.Item name="requiereAutorizacion" label="Requiere Autorización ARS" valuePropName="checked">
        <Switch />
      </Form.Item>
      {modal === 'editar' && (
        <Form.Item name="isActive" label="Activo" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Catálogo de Servicios</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['clinica-catalogo']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ duracionMinutos: 30, requiereAutorizacion: false, isActive: true }); setModal('crear'); }}>
            Nuevo
          </Button>
        </div>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="Filtrar especialidad" allowClear style={{ width: 200 }} value={especialidad} onChange={v => setEspecialidad(v)}>
          {ESPECIALIDADES.map(e => <Option key={e} value={e}>{e}</Option>)}
        </Select>
      </Space>

      <Table
        columns={filterColumns(cols as any)}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} servicios` }}
      />

      <Modal
        open={modal !== null}
        title={modal === 'crear' ? 'Nuevo Servicio' : 'Editar Servicio'}
        onCancel={() => setModal(null)}
        onOk={() => form.validateFields().then(vals => modal === 'crear' ? crear.mutate(vals) : actualizar.mutate(vals))}
        confirmLoading={crear.isPending || actualizar.isPending}
        okText="Guardar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <CatForm />
        </Form>
      </Modal>
    </div>
  );
}

