import { useState } from 'react';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag, Space } from 'antd';
import { PlusOutlined, FileExcelOutlined, EyeOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { useNavigate } from 'react-router-dom';
import { agroApi } from '../../api/agro.api';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'arete',    label: 'Arete',     defaultVisible: true  },
  { key: 'nombre',   label: 'Nombre',    defaultVisible: true  },
  { key: 'tipo',     label: 'Tipo',      defaultVisible: true  },
  { key: 'raza',     label: 'Raza',      defaultVisible: false },
  { key: 'sexo',     label: 'Sexo',      defaultVisible: true  },
  { key: 'fn',       label: 'Nac.',      defaultVisible: false },
  { key: 'peso',     label: 'Peso',      defaultVisible: true  },
  { key: 'proposito',label: 'Propósito', defaultVisible: false },
  { key: 'estado',   label: 'Estado',    defaultVisible: true  },
];

export default function GanaderiaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<any>({});
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-ganaderia', COLS_DEF);

  const { data: resp, isLoading } = useQuery({
    queryKey: ['agro-animales', filters],
    queryFn: () => agroApi.getAnimales(filters),
  });
  const animales: any[] = (resp as any)?.data ?? resp ?? [];

  const { data: fincas = [] } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => {
      const payload = { ...vals, fechaNacimiento: vals.fechaNacimiento?.format?.('YYYY-MM-DD') ?? undefined };
      return modal.item ? agroApi.updateAnimal(modal.item.id, payload) : agroApi.crearAnimal(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-animales'] }); setModal({ open: false }); form.resetFields(); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const estadoColor: Record<string, string> = { activo: 'green', vendido: 'blue', muerto: 'red', descartado: 'orange' };

  const cols = [
    { title: 'Arete',     key: 'arete',    dataIndex: 'arete' },
    { title: 'Nombre',    key: 'nombre',   dataIndex: 'nombre' },
    { title: 'Tipo',      key: 'tipo',     dataIndex: 'tipo' },
    { title: 'Raza',      key: 'raza',     dataIndex: 'raza' },
    { title: 'Sexo',      key: 'sexo',     dataIndex: 'sexo',            render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Nac.',      key: 'fn',       dataIndex: 'fechaNacimiento', render: (v: string) => v ? String(v).split('T')[0] : '-' },
    { title: 'Peso (kg)', key: 'peso',     dataIndex: 'pesoActual' },
    { title: 'Propósito', key: 'proposito',dataIndex: 'proposito' },
    { title: 'Estado',    key: 'estado',   dataIndex: 'estado',          render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
    {
      title: '', key: 'acc',
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/agro/ganaderia/${r.id}`)}>Ver</Button>
          <Button size="small" onClick={() => { form.setFieldsValue({ ...r, fechaNacimiento: r.fechaNacimiento ? dayjs(r.fechaNacimiento) : undefined }); setModal({ open: true, item: r }); }}>Editar</Button>
        </Space>
      ),
    },
  ];

  const exportar = () => {
    const rows = animales.map((r: any) => ({
      'Arete':     r.arete,
      'Nombre':    r.nombre ?? '',
      'Tipo':      r.tipo,
      'Raza':      r.raza ?? '',
      'Sexo':      r.sexo,
      'Nac.':      r.fechaNacimiento ? String(r.fechaNacimiento).split('T')[0] : '',
      'Peso (kg)': r.pesoActual ?? '',
      'Propósito': r.proposito ?? '',
      'Estado':    r.estado,
    }));
    exportarExcel(rows, `Animales-${hoyRD()}`);
    message.success(`${rows.length} animales exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Ganadería</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Select placeholder="Tipo" allowClear style={{ width: 110 }} onChange={v => setFilters((f: any) => ({ ...f, tipo: v }))}
            options={[{ value: 'bovino', label: 'Bovino' }, { value: 'porcino', label: 'Porcino' }, { value: 'ovino', label: 'Ovino' }, { value: 'caprino', label: 'Caprino' }, { value: 'equino', label: 'Equino' }, { value: 'avicola', label: 'Avícola' }]} />
          <Select placeholder="Estado" allowClear style={{ width: 110 }} onChange={v => setFilters((f: any) => ({ ...f, estado: v }))}
            options={[{ value: 'activo', label: 'Activo' }, { value: 'vendido', label: 'Vendido' }, { value: 'muerto', label: 'Muerto' }]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['agro-animales', filters]} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>
              Nuevo Animal
            </Button>
          </div>
        </div>
      </div>

      <Table loading={isLoading} dataSource={animales} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} animales`, showSizeChanger: false }} />

      <Modal open={modal.open} title={modal.item ? 'Editar Animal' : 'Registrar Animal'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fincaId" label="Finca">
            <Select options={(fincas as any[]).map((f: any) => ({ value: f.id, label: f.nombre }))} allowClear />
          </Form.Item>
          <Form.Item name="arete" label="Arete / Identificador" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="nombre" label="Nombre"><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[{ value: 'bovino', label: 'Bovino' }, { value: 'porcino', label: 'Porcino' }, { value: 'ovino', label: 'Ovino' }, { value: 'caprino', label: 'Caprino' }, { value: 'equino', label: 'Equino' }, { value: 'avicola', label: 'Avícola' }, { value: 'otro', label: 'Otro' }]} />
          </Form.Item>
          <Form.Item name="raza" label="Raza"><Input /></Form.Item>
          <Form.Item name="sexo" label="Sexo" rules={[{ required: true }]}>
            <Select options={[{ value: 'macho', label: 'Macho' }, { value: 'hembra', label: 'Hembra' }]} />
          </Form.Item>
          <Form.Item name="fechaNacimiento" label="Fecha Nacimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="pesoNacimiento" label="Peso al Nacer (kg)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="pesoActual" label="Peso Actual (kg)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="proposito" label="Propósito">
            <Select allowClear options={[{ value: 'leche', label: 'Leche' }, { value: 'carne', label: 'Carne' }, { value: 'doble', label: 'Doble Propósito' }, { value: 'reproduccion', label: 'Reproducción' }, { value: 'trabajo', label: 'Trabajo' }]} />
          </Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="activo">
            <Select options={[{ value: 'activo', label: 'Activo' }, { value: 'vendido', label: 'Vendido' }, { value: 'muerto', label: 'Muerto' }, { value: 'descartado', label: 'Descartado' }]} />
          </Form.Item>
          <Form.Item name="colorPelaje" label="Color / Pelaje"><Input /></Form.Item>
          <Form.Item name="marcas" label="Marcas Distintivas"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
