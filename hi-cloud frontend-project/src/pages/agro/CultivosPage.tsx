import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, Tag, message, theme } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';

const TIPOS_CULTIVO = [
  { value: 'graminea',    label: 'Gramínea (arroz, maíz, sorgo)' },
  { value: 'leguminosa',  label: 'Leguminosa (habichuela, gandules)' },
  { value: 'hortaliza',   label: 'Hortaliza (tomate, lechuga)' },
  { value: 'frutal',      label: 'Frutal (plátano, mango)' },
  { value: 'tuberculo',   label: 'Tubérculo (yuca, ñame)' },
  { value: 'forrajera',   label: 'Forrajera (pastos)' },
  { value: 'condimento',  label: 'Condimento (ají, orégano)' },
  { value: 'otro',        label: 'Otro' },
];

export default function CultivosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();

  const { data: cultivos = [], isLoading } = useQuery({
    queryKey: ['agro-cultivos'],
    queryFn: () => agroApi.getCultivos(),
  });

  const save = useMutation({
    mutationFn: (vals: any) =>
      modal.item ? agroApi.updateCultivo(modal.item.id, vals) : agroApi.crearCultivo(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agro-cultivos'] });
      setModal({ open: false });
      form.resetFields();
      message.success('Guardado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const openEdit = (item: any) => {
    form.setFieldsValue({ ...item });
    setModal({ open: true, item });
  };

  const openNew = () => {
    form.resetFields();
    setModal({ open: true });
  };

  const exportar = () => {
    const rows = (cultivos as any[]).map((r: any) => ({
      'Nombre':                  r.nombre,
      'Variedad':                r.variedad ?? '',
      'Tipo':                    r.tipo ?? '',
      'Días Ciclo Promedio':     r.diasCicloPromedio ?? '',
      'Rendimiento Esperado':    r.rendimientoEsperado ?? '',
      'Unidad Rendimiento':      r.unidadRendimiento ?? '',
      'Unidad por Área':         r.unidadPorArea ?? '',
    }));
    exportarExcel(rows, `Cultivos-${new Date().toISOString().split('T')[0]}`);
    message.success(`${rows.length} cultivos exportados`);
  };

  const cols = [
    {
      title: 'Nombre', dataIndex: 'nombre', key: 'nombre',
      render: (v: string, r: any) => (
        <span>
          <strong>{v}</strong>
          {r.variedad && <span style={{ color: C.colorTextSecondary, marginLeft: 6, fontSize: 12 }}>— {r.variedad}</span>}
        </span>
      ),
    },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo',
      render: (v: string) => v ? <Tag>{TIPOS_CULTIVO.find(t => t.value === v)?.label.split(' ')[0] ?? v}</Tag> : '-',
    },
    {
      title: 'Días Ciclo', dataIndex: 'diasCicloPromedio', key: 'dias',
      render: (v: any) => v ? `${v} d` : '-',
    },
    {
      title: 'Rendimiento Esperado', key: 'rend',
      render: (_: any, r: any) =>
        r.rendimientoEsperado
          ? `${Number(r.rendimientoEsperado).toLocaleString('es-DO')} ${r.unidadRendimiento ?? ''} / ${r.unidadPorArea ?? 'área'}`
          : '-',
    },
    {
      title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => (
        <Button size="small" onClick={() => openEdit(r)}>Editar</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Cultivos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <RefreshByKeyButton queryKey={['agro-cultivos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Nuevo Cultivo</Button>
        </div>
      </div>

      <Table
        loading={isLoading}
        dataSource={cultivos as any[]}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        columns={cols}
        pagination={{ showTotal: t => `${t} cultivos`, showSizeChanger: false }}
      />

      <Modal
        open={modal.open}
        title={modal.item ? 'Editar Cultivo' : 'Nuevo Cultivo'}
        onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))}
        confirmLoading={save.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: 'El nombre es obligatorio' }]}>
            <Input placeholder="Ej: Arroz, Habichuela, Plátano..." maxLength={100} />
          </Form.Item>
          <Form.Item name="variedad" label="Variedad">
            <Input placeholder="Ej: Idiap 137, Criollo, Williams..." maxLength={100} />
          </Form.Item>
          <Form.Item name="tipo" label="Tipo">
            <Select placeholder="Seleccionar tipo" allowClear options={TIPOS_CULTIVO} />
          </Form.Item>
          <Form.Item name="diasCicloPromedio" label="Días de Ciclo Promedio">
            <InputNumber min={1} max={3650} style={{ width: 180 }} placeholder="Ej: 90" addonAfter="días" />
          </Form.Item>
          <Form.Item label="Rendimiento Esperado" style={{ marginBottom: 0 }}>
            <Form.Item name="rendimientoEsperado" style={{ display: 'inline-block', width: 160, marginRight: 8 }}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="Ej: 50" />
            </Form.Item>
            <Form.Item name="unidadRendimiento" style={{ display: 'inline-block', width: 130, marginRight: 8 }}>
              <Input placeholder="kg, quintal..." maxLength={30} />
            </Form.Item>
            <span style={{ lineHeight: '32px', color: C.colorTextSecondary }}>por</span>
            <Form.Item name="unidadPorArea" style={{ display: 'inline-block', width: 120, marginLeft: 8 }}>
              <Input placeholder="tarea, ha..." maxLength={50} />
            </Form.Item>
          </Form.Item>
          {modal.item && (
            <Form.Item name="isActive" label="Activo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
