import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Select, Tag, Modal, Form, Input, InputNumber, DatePicker, message, theme } from 'antd';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const estadoColor: Record<string, string> = { al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default', refinanciado: 'purple' };

export default function PrestamosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data = [], isLoading } = useQuery({
    queryKey: ['prestamista-prestamos', estado],
    queryFn: () => prestamistalApi.getPrestamos(estado ? { estado } : {}),
  });

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['prestamista-solicitudes-aprobadas'],
    queryFn: () => prestamistalApi.getSolicitudes({ estado: 'aprobada' }),
  });

  const crear = useMutation({
    mutationFn: (vals: any) => prestamistalApi.crearPrestamo(vals),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-prestamos'] });
      qc.invalidateQueries({ queryKey: ['prestamista-solicitudes'] });
      setOpen(false);
      form.resetFields();
      if (d?.id) navigate(`/prestamista/prestamos/${d.id}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al crear préstamo'),
  });

  const cols = [
    { title: 'Número', dataIndex: 'numero', width: 120 },
    { title: 'Deudor', dataIndex: 'deudorNombre' },
    { title: 'Capital', dataIndex: 'montoPrincipal', render: fmt },
    { title: 'Saldo Capital', dataIndex: 'saldoCapital', render: fmt },
    { title: 'Saldo Mora', dataIndex: 'saldoMora', render: (v: any) => <span style={{ color: Number(v) > 0 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
    { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v.replace('_', ' ')}</Tag> },
    { title: 'Cuotas Vencidas', dataIndex: 'cuotasVencidas', render: (v: any) => v > 0 ? <Tag color="red">{v}</Tag> : v },
    { title: 'Desembolso', dataIndex: 'fechaDesembolso', render: (v: string) => v?.slice(0, 10) },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
    {
      title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => <Button size="small" icon={<Eye size={13} />} onClick={() => navigate(`/prestamista/prestamos/${r.id}`)}>Ver</Button>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Préstamos</h2>
        <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Nuevo Préstamo</Button>
      </div>

      <Select style={{ marginBottom: 16, minWidth: 160 }} placeholder="Filtrar por estado" allowClear value={estado} onChange={setEstado}>
        {['al_dia', 'moroso', 'vencido', 'pagado', 'cancelado', 'refinanciado'].map(e => <Option key={e} value={e}>{e.replace('_', ' ')}</Option>)}
      </Select>

      <Table dataSource={(data as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={cols}
        loading={isLoading} scroll={{ x: 'max-content' }} />

      <Modal title="Nuevo Préstamo (Desembolso)" open={open} onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crear.mutate(v))} okText="Desembolsar" width={600} confirmLoading={crear.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="solicitudId" label="Solicitud Aprobada" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar solicitud aprobada">
              {(solicitudes as any[]).map((s: any) => (
                <Option key={s.id} value={s.id}>
                  {s.numero} — {s.deudorNombre} — {fmt(s.montoAprobado ?? s.montoSolicitado)}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="fechaDesembolso" label="Fecha Desembolso" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="cuentaBancariaId" label="Cuenta Bancaria (opcional)">
              <InputNumber style={{ width: '100%' }} placeholder="ID cuenta" />
            </Form.Item>
          </div>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
