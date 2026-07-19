import { useState } from 'react';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';

const COLS_DEF = [
  { key: 'nombre',  label: 'Nombre',        defaultVisible: true  },
  { key: 'tipo',    label: 'Tipo',          defaultVisible: true  },
  { key: 'marca',   label: 'Marca',         defaultVisible: false },
  { key: 'modelo',  label: 'Modelo',        defaultVisible: false },
  { key: 'anio',    label: 'Año',           defaultVisible: false },
  { key: 'ch',      label: 'Costo/Hora',    defaultVisible: true  },
  { key: 'cd',      label: 'Costo/Día',     defaultVisible: false },
  { key: 'estado',  label: 'Estado',        defaultVisible: true  },
  { key: 'pm',      label: 'Prox. Mant.',   defaultVisible: true  },
];

export default function MaquinariaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-maquinaria', COLS_DEF);

  const { data: maquinaria = [], isLoading } = useQuery({ queryKey: ['agro-maquinaria'], queryFn: () => agroApi.getMaquinaria() });

  const save = useMutation({
    mutationFn: (vals: any) => {
      const payload = {
        ...vals,
        fechaCompra: vals.fechaCompra?.format?.('YYYY-MM-DD') ?? undefined,
        proximoMantenimiento: vals.proximoMantenimiento?.format?.('YYYY-MM-DD') ?? undefined,
      };
      return modal.item ? agroApi.updateMaquinaria(modal.item.id, payload) : agroApi.crearMaquinaria(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-maquinaria'] }); setModal({ open: false }); form.resetFields(); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'Nombre',     key: 'nombre',  dataIndex: 'nombre' },
    { title: 'Tipo',       key: 'tipo',    dataIndex: 'tipo',   render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Marca',      key: 'marca',   dataIndex: 'marca' },
    { title: 'Modelo',     key: 'modelo',  dataIndex: 'modelo' },
    { title: 'Año',        key: 'anio',    dataIndex: 'anio' },
    { title: 'Costo/Hora', key: 'ch',      dataIndex: 'costoPorHora',         render: (v: any) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '-' },
    { title: 'Costo/Día',  key: 'cd',      dataIndex: 'costoPorDia',          render: (v: any) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '-' },
    { title: 'Estado',     key: 'estado',  dataIndex: 'estado',               render: (v: string) => <Tag color={v === 'disponible' ? 'green' : v === 'en_uso' ? 'blue' : 'orange'}>{v}</Tag> },
    { title: 'Prox. Mant.',key: 'pm',      dataIndex: 'proximoMantenimiento', render: (v: string) => v ? String(v).split('T')[0] : '-' },
    { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" onClick={() => { form.setFieldsValue({ ...r, fechaCompra: r.fechaCompra ? dayjs(r.fechaCompra) : undefined, proximoMantenimiento: r.proximoMantenimiento ? dayjs(r.proximoMantenimiento) : undefined }); setModal({ open: true, item: r }); }}>Editar</Button> },
  ];

  const exportar = () => {
    const rows = (maquinaria as any[]).map((r: any) => ({
      'Nombre':       r.nombre,
      'Tipo':         r.tipo,
      'Marca':        r.marca ?? '',
      'Modelo':       r.modelo ?? '',
      'Año':          r.anio ?? '',
      'Costo/Hora':   Number(r.costoPorHora ?? 0),
      'Costo/Día':    Number(r.costoPorDia ?? 0),
      'Estado':       r.estado,
      'Prox. Mant.':  r.proximoMantenimiento ? String(r.proximoMantenimiento).split('T')[0] : '',
    }));
    exportarExcel(rows, `Maquinaria-${new Date().toISOString().split('T')[0]}`);
    message.success(`${rows.length} equipos exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Maquinaria y Equipos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['agro-maquinaria']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>
            Nueva Maquinaria
          </Button>
        </div>
      </div>

      <Table loading={isLoading} dataSource={maquinaria as any[]} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} equipos`, showSizeChanger: false }} />

      <Modal open={modal.open} title={modal.item ? 'Editar Maquinaria' : 'Nueva Maquinaria'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'tractor', label: 'Tractor' }, { value: 'bomba_riego', label: 'Bomba de Riego' },
              { value: 'cosechadora', label: 'Cosechadora' }, { value: 'fumigadora', label: 'Fumigadora' },
              { value: 'sembradora', label: 'Sembradora' }, { value: 'vehiculo', label: 'Vehículo' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="marca" label="Marca"><Input /></Form.Item>
          <Form.Item name="modelo" label="Modelo"><Input /></Form.Item>
          <Form.Item name="anio" label="Año"><InputNumber min={1900} max={2100} style={{ width: 120 }} /></Form.Item>
          <Form.Item name="numeroSerie" label="N° Serie"><Input /></Form.Item>
          <Form.Item name="fechaCompra" label="Fecha de Compra"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="valorCompra" label="Valor de Compra (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="costoPorHora" label="Costo por Hora (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="costoPorDia" label="Costo por Día (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="estado" label="Estado" initialValue="disponible">
            <Select options={[{ value: 'disponible', label: 'Disponible' }, { value: 'en_uso', label: 'En Uso' }, { value: 'mantenimiento', label: 'Mantenimiento' }, { value: 'fuera_servicio', label: 'Fuera de Servicio' }]} />
          </Form.Item>
          <Form.Item name="proximoMantenimiento" label="Próx. Mantenimiento"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
