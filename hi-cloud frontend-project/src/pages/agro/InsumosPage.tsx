import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Switch, message, theme, Tag, Badge } from 'antd';
import { PlusOutlined, FileExcelOutlined } from '@ant-design/icons';
import { AlertTriangle } from 'lucide-react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { agroApi } from '../../api/agro.api';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'nombre',    label: 'Nombre',           defaultVisible: true  },
  { key: 'tipo',      label: 'Tipo',             defaultVisible: true  },
  { key: 'pa',        label: 'Principio Activo', defaultVisible: false },
  { key: 'sa',        label: 'Stock Actual',     defaultVisible: true  },
  { key: 'sm',        label: 'Stock Mínimo',     defaultVisible: true  },
  { key: 'cu',        label: 'Costo Unit.',      defaultVisible: false },
  { key: 'car',       label: 'Carencia',         defaultVisible: false },
  { key: 'ica',       label: 'Reg. ICA',         defaultVisible: false },
];

export default function InsumosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false });
  const [form] = Form.useForm();
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-insumos', COLS_DEF);

  const { data: insumos = [], isLoading } = useQuery({
    queryKey: ['agro-insumos', soloStockBajo],
    queryFn: () => agroApi.getInsumos(soloStockBajo ? { stockBajo: true } : {}),
  });

  const save = useMutation({
    mutationFn: (vals: any) => modal.item ? agroApi.updateInsumo(modal.item.id, vals) : agroApi.crearInsumo(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-insumos'] }); setModal({ open: false }); form.resetFields(); message.success('Guardado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const stockBajoCount = (insumos as any[]).filter((i: any) => Number(i.stockActual) <= Number(i.stockMinimo)).length;

  const cols = [
    {
      title: 'Nombre', key: 'nombre', dataIndex: 'nombre',
      render: (v: string, r: any) => {
        const bajo = Number(r.stockActual) <= Number(r.stockMinimo);
        return bajo ? <><Badge status="error" /><span style={{ color: '#ff4d4f' }}>{v}</span></> : v;
      },
    },
    { title: 'Tipo',             key: 'tipo',  dataIndex: 'tipo',           render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Principio Activo', key: 'pa',    dataIndex: 'principioActivo' },
    { title: 'Stock Actual',     key: 'sa',    render: (_: any, r: any) => `${r.stockActual} ${r.unidad ?? ''}` },
    { title: 'Stock Mínimo',     key: 'sm',    render: (_: any, r: any) => `${r.stockMinimo ?? '-'} ${r.unidad ?? ''}` },
    { title: 'Costo Unit.',      key: 'cu',    dataIndex: 'costoUnitario',  render: (v: any) => v ? `RD$${Number(v).toLocaleString('es-DO')}` : '-' },
    { title: 'Carencia',         key: 'car',   dataIndex: 'periodoCarencia',render: (v: any) => v ? `${v} días` : '-' },
    { title: 'Reg. ICA',         key: 'ica',   dataIndex: 'registroIca' },
    { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" onClick={() => { form.setFieldsValue(r); setModal({ open: true, item: r }); }}>Editar</Button> },
  ];

  const exportar = () => {
    const rows = (insumos as any[]).map((r: any) => ({
      'Nombre':           r.nombre,
      'Tipo':             r.tipo,
      'Principio Activo': r.principioActivo ?? '',
      'Stock Actual':     r.stockActual,
      'Unidad':           r.unidad ?? '',
      'Stock Mínimo':     r.stockMinimo ?? '',
      'Costo Unitario':   Number(r.costoUnitario ?? 0),
      'Carencia (días)':  r.periodoCarencia ?? '',
      'Registro ICA':     r.registroIca ?? '',
      'Stock Bajo':       Number(r.stockActual) <= Number(r.stockMinimo) ? 'Sí' : 'No',
    }));
    exportarExcel(rows, `Insumos-${hoyRD()}`);
    message.success(`${rows.length} insumos exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ color: C.colorText, margin: 0 }}>Insumos Agrícolas</h2>
          {stockBajoCount > 0 && (
            <span style={{ color: '#ff4d4f', fontSize: 13 }}>
              <AlertTriangle size={12} style={{ marginRight: 4 }} />
              {stockBajoCount} insumo{stockBajoCount > 1 ? 's' : ''} con stock bajo
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <Switch size="small" checked={soloStockBajo} onChange={setSoloStockBajo} />
            Stock bajo
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['agro-insumos', soloStockBajo]} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true }); }}>
              Nuevo Insumo
            </Button>
          </div>
        </div>
      </div>

      <Table loading={isLoading} dataSource={insumos as any[]} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} insumos`, showSizeChanger: false }} />

      <Modal open={modal.open} title={modal.item ? 'Editar Insumo' : 'Nuevo Insumo'} onCancel={() => setModal({ open: false })}
        onOk={() => form.validateFields().then(v => save.mutate(v))} confirmLoading={save.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'fertilizante', label: 'Fertilizante' }, { value: 'herbicida', label: 'Herbicida' },
              { value: 'fungicida', label: 'Fungicida' }, { value: 'insecticida', label: 'Insecticida' },
              { value: 'semilla', label: 'Semilla' }, { value: 'abono', label: 'Abono' },
              { value: 'vitamina', label: 'Vitamina' }, { value: 'medicamento', label: 'Medicamento' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="principioActivo" label="Principio Activo"><Input /></Form.Item>
          <Form.Item name="fabricante" label="Fabricante"><Input /></Form.Item>
          <Form.Item name="registroIca" label="Registro ICA / IDIAF"><Input /></Form.Item>
          <Form.Item name="unidad" label="Unidad de Medida"><Input placeholder="litro, kg, saco, galón..." /></Form.Item>
          <Form.Item name="stockActual" label="Stock Actual" initialValue={0}><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="stockMinimo" label="Stock Mínimo (alerta)"><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="costoUnitario" label="Costo Unitario (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="periodoCarencia" label="Período de Carencia (días)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
