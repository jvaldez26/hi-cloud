import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag, Space } from 'antd';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { agroApi } from '../../api/agro.api';

export default function CiclosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();
  const [estado, setEstado] = useState<string | undefined>();

  const { data: resp, isLoading } = useQuery({
    queryKey: ['agro-ciclos', estado],
    queryFn: () => agroApi.getCiclos(estado ? { estado } : {}),
  });
  const ciclos: any[] = (resp as any)?.data ?? resp ?? [];

  const { data: parcelas = [] } = useQuery({ queryKey: ['agro-parcelas'], queryFn: () => agroApi.getParcelas() });
  const { data: cultivos = [] } = useQuery({ queryKey: ['agro-cultivos'], queryFn: () => agroApi.getCultivos() });

  const crear = useMutation({
    mutationFn: (vals: any) => agroApi.crearCiclo({
      ...vals,
      fechaSiembra: vals.fechaSiembra?.format('YYYY-MM-DD'),
      fechaEstimadaCosecha: vals.fechaEstimadaCosecha?.format('YYYY-MM-DD'),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclos'] }); setModal(false); message.success('Ciclo creado'); form.resetFields(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear ciclo'),
  });

  const estadoColor: Record<string, string> = {
    planificado: 'default', sembrado: 'blue', en_crecimiento: 'green', cosechado: 'gold', cerrado: 'purple',
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: C.colorText, margin: 0 }}>Ciclos de Producción</h2>
        <Space>
          <Select placeholder="Filtrar estado" allowClear style={{ width: 160 }}
            onChange={setEstado} value={estado}
            options={[
              { value: 'planificado', label: 'Planificado' }, { value: 'sembrado', label: 'Sembrado' },
              { value: 'en_crecimiento', label: 'En Crecimiento' }, { value: 'cosechado', label: 'Cosechado' },
              { value: 'cerrado', label: 'Cerrado' },
            ]} />
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { form.resetFields(); setModal(true); }}>Nuevo Ciclo</Button>
        </Space>
      </div>

      <Table loading={isLoading} dataSource={ciclos} rowKey="id" scroll={{ x: 'max-content' }}
        columns={[
          { title: 'N°', dataIndex: 'numero', key: 'n', width: 100 },
          { title: 'Cultivo', key: 'cu', render: (_: any, r: any) => `${r.cultivoNombre}${r.cultivoVariedad ? ` (${r.cultivoVariedad})` : ''}` },
          { title: 'Parcela', dataIndex: 'parcelaNombre', key: 'p' },
          { title: 'Siembra', dataIndex: 'fechaSiembra', key: 'fs', render: (v: string) => v ? String(v).split('T')[0] : '-' },
          { title: 'Est. Cosecha', dataIndex: 'fechaEstimadaCosecha', key: 'fe', render: (v: string) => v ? String(v).split('T')[0] : '-' },
          { title: 'Días', dataIndex: 'diasTranscurridos', key: 'dt', render: (v: any) => v ?? '-' },
          { title: 'Para cosechar', dataIndex: 'diasParaCosecha', key: 'dc', render: (v: any) => v != null ? `${v}d` : '-' },
          { title: 'Costo', dataIndex: 'costoTotal', key: 'ct', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
          { title: 'Estado', dataIndex: 'estado', key: 'est', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
          { title: '', key: 'acc', render: (_: any, r: any) => <Button size="small" icon={<Eye size={12} />} onClick={() => navigate(`/agro/ciclos/${r.id}`)}>Ver</Button> },
        ]} />

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
