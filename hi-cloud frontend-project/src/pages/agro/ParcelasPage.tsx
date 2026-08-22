import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, message, theme, Tag } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'nombre',      label: 'Nombre',       defaultVisible: true  },
  { key: 'codigo',      label: 'Código',        defaultVisible: false },
  { key: 'area',        label: 'Área',          defaultVisible: true  },
  { key: 'tipoSuelo',   label: 'Tipo Suelo',    defaultVisible: false },
  { key: 'estado',      label: 'Estado',        defaultVisible: true  },
  { key: 'cultivoActual', label: 'Cultivo',     defaultVisible: true  },
];

export default function ParcelasPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-parcelas', COLS_DEF);

  const { data: parcelas = [], isLoading } = useQuery({ queryKey: ['agro-parcelas'], queryFn: () => agroApi.getParcelas() });
  const { data: fincas = [] } = useQuery({ queryKey: ['agro-fincas'], queryFn: () => agroApi.getFincas() });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateParcela(modal.item.id, vals) : agroApi.crearParcela(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-parcelas'] }); setModal({ open: false }); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const estadoColor: Record<string, string> = { disponible: 'green', sembrada: 'blue', en_descanso: 'orange', preparacion: 'purple' };

  const cols = [
    { title: 'Nombre',        key: 'nombre',        dataIndex: 'nombre' },
    { title: 'Código',        key: 'codigo',        dataIndex: 'codigo' },
    { title: 'Área',          key: 'area',          render: (_: any, r: any) => r.area ? `${r.area} ${r.unidadArea}` : '-' },
    { title: 'Tipo Suelo',    key: 'tipoSuelo',     dataIndex: 'tipoSuelo' },
    { title: 'Estado',        key: 'estado',        dataIndex: 'estado',       render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
    { title: 'Cultivo Actual',key: 'cultivoActual', dataIndex: 'cultivoActual' },
    { title: '', key: 'acc',  render: (_: any, r: any) => <Button size="small" onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button> },
  ];

  const exportar = () => {
    const rows = (parcelas as any[]).map((r: any) => ({
      'Nombre':    r.nombre,
      'Código':    r.codigo ?? '',
      'Área':      r.area ? `${r.area} ${r.unidadArea}` : '',
      'Tipo Suelo':r.tipoSuelo ?? '',
      'Estado':    r.estado ?? '',
      'Cultivo':   r.cultivoActual ?? '',
    }));
    exportarExcel(rows, `Parcelas-${hoyRD()}`);
    message.success(`${rows.length} parcelas exportadas`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Parcelas / Lotes</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['agro-parcelas']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>
            Nueva Parcela
          </Button>
        </div>
      </div>

      <Table loading={isLoading} dataSource={parcelas as any[]} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} parcelas`, showSizeChanger: false }} />

      <Modal open={modal.open} title={modal.item ? 'Editar Parcela' : 'Nueva Parcela'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fincaId" label="Finca">
            <Select options={(fincas as any[]).map((f: any) => ({ value: f.id, label: f.nombre }))} allowClear />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="codigo" label="Código"><Input /></Form.Item>
          <Form.Item name="area" label="Área"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="unidadArea" label="Unidad de Área" initialValue="tarea">
            <Select options={[{ value: 'tarea', label: 'Tarea' }, { value: 'hectarea', label: 'Hectárea' }]} />
          </Form.Item>
          <Form.Item name="tipoSuelo" label="Tipo de Suelo">
            <Select allowClear options={[{ value: 'arcilloso', label: 'Arcilloso' }, { value: 'arenoso', label: 'Arenoso' }, { value: 'franco', label: 'Franco' }, { value: 'limoso', label: 'Limoso' }]} />
          </Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="disponible">
            <Select options={[{ value: 'disponible', label: 'Disponible' }, { value: 'sembrada', label: 'Sembrada' }, { value: 'en_descanso', label: 'En Descanso' }, { value: 'preparacion', label: 'Preparación' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
