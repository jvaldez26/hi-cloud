import { useState } from 'react';
import {
  Card, Button, Table, Typography, Row, Col, Modal, Form, Input,
  Select, message, Space, theme, InputNumber, Tag, Tabs, Badge,
} from 'antd';
import { PlusOutlined, SearchOutlined, TableOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { TableActions } from '../../components/ui/TableActions';
import { RefreshByKeyButton } from '../../components/ui/TableToolbar';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const ESTADOS = ['pendiente', 'en_proceso', 'lista', 'entregada'] as const;
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', lista: 'Lista', entregada: 'Entregada', cancelada: 'Cancelada',
};
const ESTADO_OPS = [
  { value: 'pendiente',  label: 'Pendiente'  },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'lista',      label: 'Lista'      },
  { value: 'entregada',  label: 'Entregada'  },
  { value: 'cancelada',  label: 'Cancelada'  },
];
const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'orange', en_proceso: 'blue', lista: 'cyan',
  entregada: 'green', cancelada: 'red',
};
const KANBAN_HEADER: Record<string, string> = {
  pendiente: '#fa8c16', en_proceso: '#1677ff', lista: '#13c2c2', entregada: '#52c41a',
};

// ── Shared modal de edición ───────────────────────────────────────────────────

function OrdenModal({ open, editing, form, pacienteOpts, saveMut, onClose }: any) {
  return (
    <Modal
      title={editing ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
      open={open} onCancel={onClose} footer={null} width={680}
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
              <Input placeholder="Marco completo, sin aro..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="marcaMontura" label="Marca">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="colorMontura" label="Color">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="tipoLente" label="Tipo de lente">
              <Input placeholder="Monofocal, bifocal, progresivo..." />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="materialLente" label="Material">
              <Input placeholder="CR-39, policarbonato..." />
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
          <Col xs={24} sm={8}>
            <Form.Item name="subtotal" label="Subtotal">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="itbis" label="ITBIS">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
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
          <Col><Button onClick={onClose}>Cancelar</Button></Col>
          <Col>
            <Button type="primary" htmlType="submit" loading={saveMut.isPending}>
              {editing ? 'Guardar cambios' : 'Crear orden'}
            </Button>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Vista Kanban ──────────────────────────────────────────────────────────────

function KanbanView({ ordenes, moveMut, openEdit }: any) {
  const { token } = theme.useToken();

  const byEstado = ESTADOS.reduce<Record<string, any[]>>((acc, est) => {
    acc[est] = ordenes.filter((o: any) => o.estado === est);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Row gutter={12} style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 8 }}>
      {ESTADOS.map(estado => (
        <Col key={estado} style={{ minWidth: 240, flex: '0 0 240px' }}>
          <div style={{
            background: token.colorFillTertiary,
            borderRadius: token.borderRadius,
            padding: '8px 0',
          }}>
            <div style={{
              padding: '6px 12px 10px',
              borderBottom: `3px solid ${KANBAN_HEADER[estado]}`,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Text strong style={{ fontSize: 13 }}>{ESTADO_LABEL[estado]}</Text>
              <Badge count={byEstado[estado].length} color={KANBAN_HEADER[estado]} />
            </div>

            <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {byEstado[estado].map((o: any) => (
                <Card
                  key={o.id}
                  size="small"
                  hoverable
                  onClick={() => openEdit(o)}
                  style={{ cursor: 'pointer', borderLeft: `3px solid ${KANBAN_HEADER[estado]}` }}
                  styles={{ body: { padding: '8px 10px' } }}
                >
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{o.numero}</Text>
                  <Text style={{ fontSize: 12 }}>{o.pacienteNombre ?? '—'}</Text>
                  {o.tipoLente && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{o.tipoLente}</Text>
                  )}
                  <Row justify="space-between" style={{ marginTop: 4 }}>
                    {o.total ? (
                      <Text style={{ fontSize: 11 }}>{fmt.money(o.total)}</Text>
                    ) : null}
                    {o.balance > 0 ? (
                      <Text style={{ fontSize: 11, color: '#f5222d' }}>Saldo: {fmt.money(o.balance)}</Text>
                    ) : null}
                  </Row>
                  {/* Botones de avance rápido de estado */}
                  {estado !== 'entregada' && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                      {ESTADOS.indexOf(estado) < ESTADOS.length - 1 && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          style={{ fontSize: 10, padding: '0 6px', height: 20 }}
                          onClick={e => { e.stopPropagation(); moveMut.mutate({ id: o.id, estado: ESTADOS[ESTADOS.indexOf(estado) + 1] }); }}
                          loading={moveMut.isPending}
                        >
                          → {ESTADO_LABEL[ESTADOS[ESTADOS.indexOf(estado) + 1]]}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
              {byEstado[estado].length === 0 && (
                <Text type="secondary" style={{ fontSize: 11, textAlign: 'center', display: 'block', padding: '12px 0' }}>
                  Sin órdenes
                </Text>
              )}
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ── Vista tabla ───────────────────────────────────────────────────────────────

function TablaView({ ordenes, isLoading, search, setSearch, filtroEstado, setFiltro, token, openEdit }: any) {
  const rows = ordenes.filter((o: any) =>
    `${o.pacienteNombre ?? ''} ${o.numero ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', key: 'pac', ellipsis: true, render: (_: any, r: any) => r.pacienteNombre ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{ESTADO_LABEL[v] ?? v}</Tag>,
    },
    { title: 'Lente', dataIndex: 'tipoLente', ellipsis: true, render: (v: any) => v ?? '—' },
    { title: 'Laboratorio', dataIndex: 'laboratorio', width: 130, render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Saldo', dataIndex: 'balance', width: 110, align: 'right' as const,
      render: (v: any) => v && Number(v) > 0
        ? <span style={{ color: '#f5222d' }}>{fmt.money(v)}</span>
        : '—',
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions onView={() => openEdit(r)} viewLabel="Editar" items={[]} />
      ),
    },
  ];

  return (
    <>
      <Row justify="space-between" gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col>
          <Space wrap>
            <Input
              placeholder="Buscar..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search} onChange={e => setSearch(e.target.value)}
              allowClear style={{ width: 220 }}
            />
            <Select
              placeholder="Estado" allowClear value={filtroEstado}
              onChange={v => setFiltro(v)} options={ESTADO_OPS} style={{ width: 150 }}
            />
          </Space>
        </Col>
        <Col><RefreshByKeyButton queryKey={['optica-ordenes']} /></Col>
      </Row>
      <Table columns={cols} dataSource={rows} rowKey="id" loading={isLoading}
        size="small" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20 }} />
    </>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

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
    queryFn: () => opticaApi.ordenes({ limit: 500, estado: filtroEstado }),
  });
  const { data: pacientesData } = useQuery({
    queryKey: ['optica-pacientes'],
    queryFn: () => opticaApi.pacientes({ limit: 500 }),
  });

  const ordenes   = (ordenesData?.data ?? ordenesData ?? []) as any[];
  const pacientes = (pacientesData?.data ?? pacientesData ?? []) as any[];
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

  const moveMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      opticaApi.actualizarOrden(id, { estado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['optica-ordenes'] });
      qc.invalidateQueries({ queryKey: ['optica-dashboard'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Órdenes de Trabajo</Title>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nueva orden
          </Button>
        }
      >
        <Tabs
          defaultActiveKey="kanban"
          items={[
            {
              key: 'kanban',
              label: <Space><AppstoreOutlined />Kanban</Space>,
              children: <KanbanView ordenes={ordenes} moveMut={moveMut} openEdit={openEdit} />,
            },
            {
              key: 'tabla',
              label: <Space><TableOutlined />Tabla</Space>,
              children: (
                <TablaView
                  ordenes={ordenes} isLoading={isLoading}
                  search={search} setSearch={setSearch}
                  filtroEstado={filtroEstado} setFiltro={setFiltro}
                  token={token} openEdit={openEdit}
                />
              ),
            },
          ]}
        />
      </Card>

      <OrdenModal
        open={open} editing={editing} form={form}
        pacienteOpts={pacienteOpts} saveMut={saveMut} onClose={closeModal}
      />
    </div>
  );
}
