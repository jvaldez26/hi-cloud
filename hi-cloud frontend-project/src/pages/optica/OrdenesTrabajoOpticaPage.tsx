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
  { value: 'pendiente',    label: 'Pendiente'    },
  { value: 'en_proceso',   label: 'En proceso'   },
  { value: 'lista',        label: 'Lista'        },
  { value: 'entregada',    label: 'Entregada'    },
  { value: 'cancelada',    label: 'Cancelada'    },
];
const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', en_proceso: 'blue', lista: 'cyan',
  entregada: 'green', cancelada: 'red',
};

export default function OrdenesTrabajoOpticaPage() {
  const { token } = theme.useToken();
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: ordenesData, isLoading } = useQuery({
    queryKey: ['optica-ordenes', filtroEstado],
    queryFn: () => opticaApi.ordenes({ limit: 200, estado: filtroEstado }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });

  const ordenes   = (ordenesData?.data ?? ordenesData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];

  const rows = ordenes.filter((o: any) =>
    `${o.pacienteNombre ?? ''} ${o.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const pacienteOpts = pacientes.map((p: any) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }));

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (r: any) => { setEditing(r); form.setFieldsValue(r); setOpen(true); };
  const closeModal = () => { setOpen(false); form.resetFields(); setEditing(null); };

  const saveMut = useMutation({
    mutationFn: (v: any) =>
      editing ? opticaApi.actualizarOrden(editing.id, v) : opticaApi.crearOrden(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
      message.success(editing ? 'Orden actualizada' : 'Orden creada');
      closeModal();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    { title: 'Tipo montura', dataIndex: 'tipoMontura', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Saldo', dataIndex: 'saldoPendiente', width: 110, align: 'right' as const,
      render: (v: any) => v && Number(v) > 0 ? (
        <span style={{ color: '#f5222d' }}>{fmt.money(v)}</span>
      ) : '—',
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
      <Title level={4} style={{ marginBottom: 16 }}>Órdenes de Trabajo</Title>
      <Card>
        <Row justify="space-between" gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col>
            <Space wrap>
              <Input
                placeholder="Buscar por paciente o N°..."
                prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
                style={{ width: 240 }}
              />
              <Select
                placeholder="Filtrar estado"
                allowClear
                value={filtroEstado}
                onChange={v => setFiltro(v)}
                options={ESTADO_OPS}
                style={{ width: 160 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <RefreshByKeyButton queryKey={['optica-ordenes']} />
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Nueva orden
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
        title={editing ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
        open={open}
        onCancel={closeModal}
        footer={null}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="pacienteId" label="Paciente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={pacienteOpts} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="recetaId" label="Receta (ID)">
                <InputNumber style={{ width: '100%' }} min={1} />
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
              <Form.Item name="tipoMontura" label="Tipo de montura">
                <Input placeholder="Marco completo, sin aro, etc." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="marcaMontura" label="Marca montura">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="colorMontura" label="Color montura">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tipoLente" label="Tipo de lente">
                <Input placeholder="Monofocal, bifocal, progresivo..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="materialLente" label="Material lente">
                <Input placeholder="CR-39, policarbonato, trivex..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="tratamientoLente" label="Tratamiento">
                <Input placeholder="Antirreflejo, fotocromático..." />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="laboratorio" label="Laboratorio">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="total" label="Total">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="anticipo" label="Anticipo">
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
                {editing ? 'Guardar cambios' : 'Crear orden'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
