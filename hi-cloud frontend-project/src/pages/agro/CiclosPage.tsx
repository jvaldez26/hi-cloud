import { useState } from 'react';
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
  { key: 'numero',              label: 'N°',            defaultVisible: true  },
  { key: 'cu',                  label: 'Cultivo',       defaultVisible: true  },
  { key: 'p',                   label: 'Parcela',       defaultVisible: true  },
  { key: 'fs',                  label: 'Siembra',       defaultVisible: true  },
  { key: 'fe',                  label: 'Est. Cosecha',  defaultVisible: true  },
  { key: 'dt',                  label: 'Días',          defaultVisible: false },
  { key: 'dc',                  label: 'Para cosechar', defaultVisible: false },
  { key: 'ct',                  label: 'Costo',         defaultVisible: true  },
  { key: 'estado',              label: 'Estado',        defaultVisible: true  },
];

export default function CiclosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();
  const [estado, setEstado] = useState<string | undefined>();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('agro-ciclos', COLS_DEF);

  const { data: resp, isLoading } = useQuery({
    queryKey: ['agro-ciclos', estado],
    queryFn: () => agroApi.getCiclos(estado ? { estado } : {}),
  });
  const ciclos: any[] = (resp as any)?.data ?? resp ?? [];

  const { data: parcelas = [] } = useQuery({ queryKey: ['agro-parcelas'], queryFn: () => agroApi.getParcelas() });
  const { data: cultivos  = [] } = useQuery({ queryKey: ['agro-cultivos'], queryFn: () => agroApi.getCultivos() });

  const crear = useMutation({
    mutationFn: (vals: any) => agroApi.crearCiclo({
      ...vals,
      fechaSiembra: vals.fechaSiembra?.format('YYYY-MM-DD'),
      fechaEstimadaCosecha: vals.fechaEstimadaCosecha?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclos'] }); setModal(false); form.resetFields(); message.success('Ciclo creado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear ciclo'),
  });

  const estadoColor: Record<string, string> = {
    planificado: 'default', sembrado: 'blue', en_crecimiento: 'green', cosechado: 'gold', cerrado: 'purple',
  };

  const cols = [
    { title: 'N°',           key: 'numero',  dataIndex: 'numero', width: 100 },
    { title: 'Cultivo',      key: 'cu',      render: (_: any, r: any) => `${r.cultivoNombre}${r.cultivoVariedad ? ` (${r.cultivoVariedad})` : ''}` },
    { title: 'Parcela',      key: 'p',       dataIndex: 'parcelaNombre' },
    { title: 'Siembra',      key: 'fs',      dataIndex: 'fechaSiembra',        render: (v: string) => v ? String(v).split('T')[0] : '-' },
    { title: 'Est. Cosecha', key: 'fe',      dataIndex: 'fechaEstimadaCosecha', render: (v: string) => v ? String(v).split('T')[0] : '-' },
    { title: 'Días',         key: 'dt',      dataIndex: 'diasTranscurridos',   render: (v: any) => v ?? '-' },
    { title: 'Para cosechar',key: 'dc',      dataIndex: 'diasParaCosecha',     render: (v: any) => v != null ? `${v}d` : '-' },
    { title: 'Costo',        key: 'ct',      dataIndex: 'costoTotal',          render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
    { title: 'Estado',       key: 'estado',  dataIndex: 'estado',              render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
    { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/agro/ciclos/${r.id}`)}>Ver</Button> },
  ];

  const exportar = () => {
    const rows = ciclos.map((r: any) => ({
      'N°':            r.numero,
      'Cultivo':       `${r.cultivoNombre}${r.cultivoVariedad ? ` (${r.cultivoVariedad})` : ''}`,
      'Parcela':       r.parcelaNombre ?? '',
      'Siembra':       r.fechaSiembra ? String(r.fechaSiembra).split('T')[0] : '',
      'Est. Cosecha':  r.fechaEstimadaCosecha ? String(r.fechaEstimadaCosecha).split('T')[0] : '',
      'Días':          r.diasTranscurridos ?? '',
      'Para Cosechar': r.diasParaCosecha ?? '',
      'Costo Total':   Number(r.costoTotal ?? 0),
      'Estado':        r.estado,
    }));
    exportarExcel(rows, `Ciclos-${hoyRD()}`);
    message.success(`${rows.length} ciclos exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Ciclos de Producción</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Select placeholder="Estado" allowClear style={{ width: 150 }} onChange={setEstado} value={estado}
            options={[
              { value: 'planificado', label: 'Planificado' }, { value: 'sembrado', label: 'Sembrado' },
              { value: 'en_crecimiento', label: 'En Crecimiento' }, { value: 'cosechado', label: 'Cosechado' },
              { value: 'cerrado', label: 'Cerrado' },
            ]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['agro-ciclos', estado]} />
            <VideoTutorialButton />
            <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>
              Nuevo Ciclo
            </Button>
          </div>
        </div>
      </div>

      <Table loading={isLoading} dataSource={ciclos} rowKey="id"
        scroll={{ x: 'max-content' }} size="small"
        columns={filterColumns(cols as any)}
        pagination={{ showTotal: t => `${t} ciclos`, showSizeChanger: false }} />

      <Modal open={modal} title="Nuevo Ciclo de Producción" onCancel={() => setModal(false)}
        onOk={() => form.validateFields().then(v => crear.mutate(v))} confirmLoading={crear.isPending} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="parcelaId" label="Parcela" rules={[{ required: true }]}>
            <Select options={(parcelas as any[]).map((p: any) => ({ value: p.id, label: `${p.nombre}${p.area ? ` (${p.area} ${p.unidadArea})` : ''}` }))} />
          </Form.Item>
          <Form.Item name="cultivoId" label="Cultivo" rules={[{ required: true }]}>
            <Select options={(cultivos as any[]).map((c: any) => ({ value: c.id, label: `${c.nombre}${c.variedad ? ` — ${c.variedad}` : ''}` }))} />
          </Form.Item>
          <Form.Item name="fechaSiembra" label="Fecha de Siembra" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="fechaEstimadaCosecha" label="Fecha Estimada de Cosecha"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="areaSembrada" label="Área Sembrada"><InputNumber min={0} style={{ width: 150 }} addonAfter="tareas" /></Form.Item>
          <Form.Item name="costoSemilla" label="Costo Semilla (RD$)" initialValue={0}><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="rendimientoEstimado" label="Rendimiento Estimado"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="unidadCosecha" label="Unidad de Cosecha"><Input placeholder="quintal, caja, racimo..." /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
