import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Tag, Drawer, DatePicker,
  Statistic,
} from 'antd';
import { PlusOutlined, SearchOutlined, BarChartOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';

const { Title } = Typography;

const ESTADO_OPS = [
  { value: 'pendiente',  label: 'Pendiente'  },
  { value: 'enviada',    label: 'Enviada'    },
  { value: 'aprobada',   label: 'Aprobada'   },
  { value: 'rechazada',  label: 'Rechazada'  },
  { value: 'pagada',     label: 'Pagada'     },
];
const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', enviada: 'blue', aprobada: 'cyan',
  rechazada: 'red', pagada: 'green',
};

// ── Drawer Reporte ────────────────────────────────────────────────────────────

function ReporteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [desde, setDesde] = useState<string | undefined>(undefined);
  const [hasta, setHasta] = useState<string | undefined>(undefined);
  const [arsFilter, setArsFilter] = useState('');

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['optica-reporte-ars', desde, hasta, arsFilter],
    queryFn: () => opticaApi.reporteArs({ desde, hasta, arsNombre: arsFilter || undefined }),
    enabled: open,
    staleTime: 30_000,
  });

  const resumen      = (data as any)?.resumen ?? [];
  const reclamaciones = (data as any)?.reclamaciones ?? [];

  const resumenCols = [
    { title: 'ARS', dataIndex: 'arsNombre', ellipsis: true },
    { title: 'Total', dataIndex: 'total', width: 70, align: 'right' as const },
    { title: 'Aprobadas', dataIndex: 'aprobadas', width: 90, align: 'right' as const },
    { title: 'Rechazadas', dataIndex: 'rechazadas', width: 100, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d' }}>{v}</span> : v },
    { title: 'Pendientes', dataIndex: 'pendientes', width: 90, align: 'right' as const },
    { title: 'Reclamado', dataIndex: 'totalReclamado', width: 110, align: 'right' as const,
      render: (v: any) => fmt.money(v ?? 0) },
    { title: 'Cubierto', dataIndex: 'totalCubierto', width: 110, align: 'right' as const,
      render: (v: any) => fmt.money(v ?? 0) },
  ];

  const totalRec  = resumen.reduce((s: number, r: any) => s + Number(r.totalReclamado  ?? 0), 0);
  const totalCub  = resumen.reduce((s: number, r: any) => s + Number(r.totalCubierto   ?? 0), 0);
  const totalCnt  = resumen.reduce((s: number, r: any) => s + Number(r.total           ?? 0), 0);
  const totalApro = resumen.reduce((s: number, r: any) => s + Number(r.aprobadas       ?? 0), 0);

  return (
    <Drawer title="Reporte Reclamaciones ARS" open={open} onClose={onClose} width={780}>
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <DatePicker placeholder="Desde" style={{ width: '100%' }}
            onChange={d => setDesde(d ? d.format('YYYY-MM-DD') : undefined)} />
        </Col>
        <Col xs={24} sm={8}>
          <DatePicker placeholder="Hasta" style={{ width: '100%' }}
            onChange={d => setHasta(d ? d.format('YYYY-MM-DD') : undefined)} />
        </Col>
        <Col xs={24} sm={8}>
          <Input placeholder="Filtrar ARS..." value={arsFilter}
            onChange={e => setArsFilter(e.target.value)} allowClear />
        </Col>
      </Row>

      {/* Totales */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Reclamaciones', value: totalCnt },
          { title: 'Aprobadas', value: totalApro, color: '#52c41a' },
          { title: 'Total Reclamado', value: fmt.money(totalRec), isStr: true },
          { title: 'Total Cubierto',  value: fmt.money(totalCub),  isStr: true, color: '#52c41a' },
        ].map(s => (
          <Col xs={12} sm={6} key={s.title}>
            <Card size="small">
              {s.isStr
                ? <Statistic title={s.title} value={s.value as string} valueStyle={s.color ? { color: s.color } : undefined} />
                : <Statistic title={s.title} value={s.value as number} valueStyle={s.color ? { color: s.color } : undefined} />
              }
            </Card>
          </Col>
        ))}
      </Row>

      <Typography.Title level={5}>Resumen por ARS</Typography.Title>
      <Table
        columns={resumenCols} dataSource={resumen} rowKey="arsNombre"
        size="small" loading={isFetching}
        scroll={{ x: 'max-content' }}
        pagination={false} style={{ marginBottom: 16 }}
      />

      <Typography.Title level={5}>Detalle ({reclamaciones.length})</Typography.Title>
      <Table
        size="small" loading={isFetching}
        dataSource={reclamaciones} rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 15 }}
        columns={[
          { title: 'N°', dataIndex: 'numero', width: 110 },
          { title: 'Paciente', dataIndex: 'pacienteNombre', ellipsis: true },
          { title: 'ARS', dataIndex: 'arsNombre', ellipsis: true },
          { title: 'Fecha', dataIndex: 'fecha', width: 100,
            render: (v: string) => fmt.date(v) },
          { title: 'Estado', dataIndex: 'estado', width: 100,
            render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
          { title: 'Reclamado', dataIndex: 'montoReclamado', width: 110, align: 'right' as const,
            render: (v: any) => v ? fmt.money(v) : '—' },
          { title: 'Cubierto', dataIndex: 'montoCubierto', width: 110, align: 'right' as const,
            render: (v: any) => v ? fmt.money(v) : '—' },
        ]}
      />
    </Drawer>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ReclamacionesArsPage() {
  const { token } = theme.useToken();
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState<string | undefined>(undefined);
  const [reporteOpen, setReporte] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: reclamacionesData, isLoading } = useQuery({
    queryKey: ['optica-reclamaciones', filtroEstado],
    queryFn: () => opticaApi.reclamaciones({ limit: 200, estado: filtroEstado }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });

  const reclamaciones = (reclamacionesData?.data ?? reclamacionesData ?? []) as any[];
  const pacientes     = (pacientesData?.data ?? pacientesData ?? []) as any[];

  const rows = reclamaciones.filter((r: any) =>
    `${r.pacienteNombre ?? ''} ${r.numero ?? ''} ${r.arsNombre ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue({ ...r, fecha: r.fecha ? dayjs(r.fecha) : null }); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) =>
      editing ? opticaApi.actualizarReclamacion(editing.id, v) : opticaApi.crearReclamacion(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-reclamaciones'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
      message.success(editing ? 'Reclamación actualizada' : 'Reclamación creada');
      closeModal();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    { title: 'ARS', dataIndex: 'arsNombre', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Afiliado', dataIndex: 'arsNumeroAfiliado', width: 130, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v ?? '—'}</Tag>,
    },
    {
      title: 'Monto', dataIndex: 'montoReclamado', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Cubierto', dataIndex: 'montoCubierto', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions onView={() => openEdit(r)} viewLabel="Editar" items={[]} />
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Reclamaciones ARS</Title>
      <Card>
        <Row justify="space-between" gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col>
            <Space wrap>
              <Input
                placeholder="Buscar por paciente, ARS o N°..."
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
                style={{ width: 260 }}
              />
              <Select
                placeholder="Filtrar estado"
                allowClear
                value={filtroEstado}
                onChange={v => setFiltro(v)}
                options={ESTADO_OPS}
                style={{ width: 150 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <RefreshByKeyButton queryKey={['optica-reclamaciones']} />
              <Button icon={<BarChartOutlined />} onClick={() => setReporte(true)}>
                Reporte
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva reclamación
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={cols}
          dataSource={rows}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Editar Reclamación ARS' : 'Nueva Reclamación ARS'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate({ ...v, fecha: v.fecha ? v.fecha.format('YYYY-MM-DD') : undefined })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={pacienteOpts} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="ordenTrabajoId" label="Orden de trabajo (ID)">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="arsNombre" label="Nombre ARS" rules={[{ required: true }]}>
                <Input placeholder="ARS Salud Segura, ARS Universal..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="arsNumeroAfiliado" label="N° Afiliado ARS">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="arsNumeroAutorizacion" label="N° Autorización">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: 'Requerida' }]}
                initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {editing && (
              <Col xs={24} sm={12}>
                <Form.Item name="estado" label="Estado">
                  <Select options={ESTADO_OPS} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item name="montoReclamado" label="Monto reclamado">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="montoCubierto" label="Monto cubierto (ARS)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="montoPaciente" label="Monto paciente">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
                {editing ? 'Guardar cambios' : 'Crear reclamación'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      <ReporteDrawer open={reporteOpen} onClose={() => setReporte(false)} />
    </div>
  );
}
