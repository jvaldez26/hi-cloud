import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, theme, Tag } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'nombre',       label: 'Nombre',       defaultVisible: true  },
  { key: 'provincia',    label: 'Provincia',     defaultVisible: true  },
  { key: 'municipio',    label: 'Municipio',     defaultVisible: false },
  { key: 'area',         label: 'Área',          defaultVisible: true  },
  { key: 'riego',        label: 'Riego',         defaultVisible: true  },
  { key: 'encargado',    label: 'Encargado',     defaultVisible: false },
  { key: 'parcelas',     label: 'Parcelas',      defaultVisible: true  },
  { key: 'act',         label: 'Activa',         defaultVisible: false },
];

export default function FincasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-fincas', COLS_DEF);

  const { data: fincas = [], isLoading } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateFinca(modal.item.id, vals) : agroApi.crearFinca(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-fincas'] }); setModal({ open: false }); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const openEdit = (item: any) => { form.setFieldsValue(item); setModal({ open: true, item }); };

  const cols = [
    { title: 'Nombre',    key: 'nombre',    dataIndex: 'nombre',    render: (v: string, r: any) => <a onClick={() => openEdit(r)}>{v}</a> },
    { title: 'Provincia', key: 'provincia', dataIndex: 'provincia' },
    { title: 'Municipio', key: 'municipio', dataIndex: 'municipio' },
    { title: 'Área',      key: 'area',      render: (_: any, r: any) => r.areaTotal ? `${r.areaTotal} ${r.unidadArea ?? 'tareas'}` : '-' },
    { title: 'Riego',     key: 'riego',     dataIndex: 'tieneRiego', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
    { title: 'Encargado', key: 'encargado', dataIndex: 'encargado' },
    { title: 'Parcelas',  key: 'parcelas',  dataIndex: 'totalParcelas' },
    { title: 'Activa',    key: 'act',       dataIndex: 'isActive',   render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Sí' : 'No'}</Tag> },
    { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" onClick={() => openEdit(r)}>Editar</Button> },
  ];

  const exportar = () => {
    const rows = (fincas as any[]).map((r: any) => ({
      'Nombre':    r.nombre,
      'Provincia': r.provincia ?? '',
      'Municipio': r.municipio ?? '',
      'Área':      r.areaTotal ? `${r.areaTotal} ${r.unidadArea ?? 'tareas'}` : '',
      'Riego':     r.tieneRiego ? 'Sí' : 'No',
      'Encargado': r.encargado ?? '',
      'Parcelas':  r.totalParcelas ?? 0,
    }));
    exportarExcel(rows, `Fincas-${hoyRD()}`);
    message.success(`${rows.length} fincas exportadas`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Fincas / Propiedades</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['agro-fincas']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>
            Nueva Finca
          </Button>
        </div>
      </div>

      <Table loading={isLoading} dataSource={fincas as any[]} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} fincas`, showSizeChanger: false }} />

      <Modal open={modal.open} title={modal.item ? 'Editar Finca' : 'Nueva Finca'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="provincia" label="Provincia"><Input /></Form.Item>
          <Form.Item name="municipio" label="Municipio"><Input /></Form.Item>
          <Form.Item name="ubicacion" label="Dirección / Referencia"><Input /></Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item name="areaTotal" label="Área Total"><InputNumber min={0} style={{ width: 120 }} /></Form.Item>
            <Form.Item name="unidadArea" label="Unidad" initialValue="tarea">
              <Select style={{ width: 120 }} options={[{ value: 'tarea', label: 'Tarea' }, { value: 'hectarea', label: 'Hectárea' }, { value: 'metro2', label: 'Metro²' }]} />
            </Form.Item>
          </div>
          <Form.Item name="tieneRiego" label="¿Tiene riego?" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="tipoRiego" label="Tipo de Riego">
            <Select allowClear options={[{ value: 'goteo', label: 'Goteo' }, { value: 'aspersion', label: 'Aspersión' }, { value: 'gravedad', label: 'Gravedad' }, { value: 'manual', label: 'Manual' }]} />
          </Form.Item>
          <Form.Item name="fuenteAgua" label="Fuente de Agua"><Input /></Form.Item>
          <Form.Item name="encargado" label="Encargado"><Input /></Form.Item>
          <Form.Item name="encargadoTelefono" label="Teléfono Encargado"><Input /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
