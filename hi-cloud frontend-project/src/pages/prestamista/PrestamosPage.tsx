import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Select, Tag, Modal, Form, Input, InputNumber, DatePicker, message, theme, Avatar, Image, Space } from 'antd';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FileExcelOutlined, UserOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';
import { hoyRD } from '../../utils/fechaRD';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const estadoColor: Record<string, string> = { al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default', refinanciado: 'purple' };

const COLS_DEF = [
  { key: 'numero', label: 'Número', defaultVisible: true },
  { key: 'deudorNombre', label: 'Deudor', defaultVisible: true },
  { key: 'montoPrincipal', label: 'Capital', defaultVisible: true },
  { key: 'saldoCapital', label: 'Saldo Capital', defaultVisible: true },
  { key: 'saldoMora', label: 'Saldo Mora', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'cuotasVencidas', label: 'Cuotas Vencidas', defaultVisible: false },
  { key: 'fechaDesembolso', label: 'Desembolso', defaultVisible: true },
  { key: 'fechaVencimiento', label: 'Vencimiento', defaultVisible: false },
];

export default function PrestamosPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-prestamos', COLS_DEF);

  const { data: prestamosResp, isLoading } = useQuery({
    queryKey: ['prestamista-prestamos', estado],
    queryFn: () => prestamistalApi.getPrestamos(estado ? { estado } : {}),
  });
  const prestamosData: any[] = (prestamosResp as any)?.data ?? prestamosResp ?? [];

  const { data: solicitudesResp } = useQuery({
    queryKey: ['prestamista-solicitudes-aprobadas'],
    queryFn: () => prestamistalApi.getSolicitudes({ estado: 'aprobada' }),
  });
  const solicitudes: any[] = (solicitudesResp as any)?.data ?? solicitudesResp ?? [];

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
    { title: 'Número', dataIndex: 'numero', key: 'numero', width: 120 },
    {
      title: 'Deudor', key: 'deudorNombre',
      render: (_: any, r: any) => (
        <Space>
          {r.deudorFoto ? (
            <Image
              width={32} height={32}
              src={r.deudorFoto}
              style={{ borderRadius: '50%', objectFit: 'cover' }}
              preview={{ src: r.deudorFoto }}
            />
          ) : (
            <Avatar size={32} icon={<UserOutlined />} />
          )}
          <span>{r.deudorNombre}</span>
        </Space>
      ),
    },
    { title: 'Capital', dataIndex: 'montoPrincipal', key: 'montoPrincipal', render: fmt },
    { title: 'Saldo Capital', dataIndex: 'saldoCapital', key: 'saldoCapital', render: fmt },
    { title: 'Saldo Mora', dataIndex: 'saldoMora', key: 'saldoMora', render: (v: any) => <span style={{ color: Number(v) > 0 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v.replace('_', ' ')}</Tag> },
    { title: 'Cuotas Vencidas', dataIndex: 'cuotasVencidas', key: 'cuotasVencidas', render: (v: any) => v > 0 ? <Tag color="red">{v}</Tag> : v },
    { title: 'Desembolso', dataIndex: 'fechaDesembolso', key: 'fechaDesembolso', render: (v: string) => v?.slice(0, 10) },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', key: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
    {
      title: '', key: 'acc', width: 80,
      render: (_: any, r: any) => <Button size="small" icon={<Eye size={13} />} onClick={() => navigate(`/prestamista/prestamos/${r.id}`)}>Ver</Button>,
    },
  ];

  const exportar = () => {
    const filas = prestamosData.map((r: any) => ({
      'Número': r.numero,
      'Deudor': r.deudorNombre,
      'Capital': r.montoPrincipal,
      'Saldo Capital': r.saldoCapital,
      'Saldo Mora': r.saldoMora,
      'Estado': r.estado,
      'Cuotas Vencidas': r.cuotasVencidas,
      'Desembolso': r.fechaDesembolso?.slice(0, 10),
      'Vencimiento': r.fechaVencimiento?.slice(0, 10),
    }));
    exportarExcel(filas, `Prestamos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Préstamos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-prestamos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Nuevo Préstamo</Button>
        </div>
      </div>

      <Select style={{ marginBottom: 16, minWidth: 160 }} placeholder="Filtrar por estado" allowClear value={estado} onChange={setEstado}>
        {['al_dia', 'moroso', 'vencido', 'pagado', 'cancelado', 'refinanciado'].map(e => <Option key={e} value={e}>{e.replace('_', ' ')}</Option>)}
      </Select>

      <Table dataSource={prestamosData.map((r: any) => ({ ...r, key: r.id }))} columns={filterColumns(cols as any)}
        loading={isLoading} scroll={{ x: 'max-content' }} />

      <Modal title="Nuevo Préstamo (Desembolso)" open={open} onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crear.mutate(v))} okText="Desembolsar" width={600} confirmLoading={crear.isPending}>
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="solicitudId" label="Solicitud Aprobada" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar solicitud aprobada">
              {solicitudes.map((s: any) => (
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
