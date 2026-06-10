import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Tag,
} from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export default function ReclamacionesArsPage() {
  const { token } = theme.useToken();
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState<string | undefined>(undefined);
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
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue(r); setOpen(true); };
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
      title: 'Aprobado', dataIndex: 'montoAprobado', width: 110, align: 'right' as const,
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
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
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
              <Form.Item name="montoAprobado" label="Monto aprobado">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="montoPagado" label="Monto pagado">
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
    </div>
  );
}
