import { useState } from 'react';
import { Row, Col, Card, Button, Tag, Modal, Form, Select, Input, InputNumber, message, Popconfirm, Empty, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

const LOCKER_COLOR: Record<string, string> = {
  disponible:     '#10b981',
  ocupado:        '#3b82f6',
  mantenimiento:  '#f59e0b',
  fuera_servicio: '#ef4444',
};

const ESTADO_LABEL: Record<string, string> = {
  disponible:     'Disponible',
  ocupado:        'Ocupado',
  mantenimiento:  'Mantenimiento',
  fuera_servicio: 'Fuera de servicio',
};

export default function LockersPage() {
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [modalOpen, setModalOpen]       = useState(false);
  const [asignarOpen, setAsignarOpen]   = useState(false);
  const [editando, setEditando]         = useState<any>(null);
  const [lockerId, setLockerId]         = useState<number | null>(null);
  const [form]      = Form.useForm();
  const [formAsig]  = Form.useForm();
  const qc          = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-lockers', estadoFiltro],
    queryFn:  () => gimnasioApi.getLockers(estadoFiltro),
  });
  const lockers: any[] = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({
    queryKey: ['gimnasio-miembros-sel'],
    queryFn:  () => gimnasioApi.getMiembros({ limit: 500 }),
  });
  const miembros: any[] = Array.isArray(miembrosData) ? miembrosData : (miembrosData as any)?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['gimnasio-lockers'] });

  const crearMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.createLocker(body),
    onSuccess:  () => { invalidate(); message.success('Locker creado'); setModalOpen(false); form.resetFields(); setEditando(null); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => gimnasioApi.updateLocker(id, body),
    onSuccess:  () => { invalidate(); message.success('Locker actualizado'); setModalOpen(false); form.resetFields(); setEditando(null); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.deleteLocker(id),
    onSuccess:  () => { invalidate(); message.success('Locker eliminado'); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const asignarMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.asignarLocker(body),
    onSuccess:  () => { invalidate(); message.success('Locker asignado'); setAsignarOpen(false); formAsig.resetFields(); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const liberarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.liberarLocker(id),
    onSuccess:  () => { invalidate(); message.success('Locker liberado'); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openCrear = () => {
    setEditando(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditar = (l: any) => {
    setEditando(l);
    form.setFieldsValue({ numero: l.numero, area: l.area, estado: l.estado, precioMes: l.precioMes });
    setModalOpen(true);
  };

  const handleOk = () => {
    form.validateFields().then(v => {
      if (editando) {
        editarMut.mutate({ id: editando.id, body: v });
      } else {
        crearMut.mutate(v);
      }
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Lockers</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select style={{ width: 180 }} placeholder="Filtrar estado" allowClear value={estadoFiltro} onChange={v => setEstadoFiltro(v)}>
            {Object.entries(ESTADO_LABEL).map(([v, l]) => <Select.Option key={v} value={v}>{l}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCrear}>Nuevo Locker</Button>
        </div>
      </div>

      {!isLoading && lockers.length === 0 && (
        <Empty
          description={<span>No hay lockers configurados.<br />Crea el primer locker con el botón "Nuevo Locker".</span>}
          style={{ padding: 60 }}
        />
      )}

      <Row gutter={[12, 12]}>
        {lockers.map((l: any) => (
          <Col key={l.id} xs={12} sm={8} md={6} lg={4}>
            <Card
              size="small"
              style={{ borderColor: LOCKER_COLOR[l.estado] ?? '#ccc', borderWidth: 2, borderStyle: 'solid' }}
              extra={
                <Dropdown
                  menu={{
                    items: [
                      { key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEditar(l) },
                      { key: 'div', type: 'divider' },
                      { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true, onClick: () => eliminarMut.mutate(l.id) },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button type="text" size="small" icon={<MoreOutlined />} />
                </Dropdown>
              }
            >
              <div style={{ fontWeight: 700, fontSize: 18, color: LOCKER_COLOR[l.estado] }}>#{l.numero}</div>
              {l.area && <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{l.area}</div>}
              <Tag color={l.estado === 'disponible' ? 'green' : l.estado === 'ocupado' ? 'blue' : 'orange'}>
                {ESTADO_LABEL[l.estado] ?? l.estado}
              </Tag>
              {l.miembroNombre && <div style={{ fontSize: 11, marginTop: 4, color: '#475569' }}>👤 {l.miembroNombre}</div>}
              {Number(l.precioMes) > 0 && (
                <div style={{ fontSize: 11, marginTop: 2, color: '#64748b' }}>
                  RD${Number(l.precioMes).toLocaleString('es-DO', { minimumFractionDigits: 2 })}/mes
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {l.estado === 'disponible' && (
                  <Button size="small" type="primary" onClick={() => { setLockerId(l.id); formAsig.resetFields(); setAsignarOpen(true); }}>
                    Asignar
                  </Button>
                )}
                {l.estado === 'ocupado' && (
                  <Popconfirm title="¿Liberar este locker?" onConfirm={() => liberarMut.mutate(l.id)} okText="Sí" cancelText="No">
                    <Button size="small" danger>Liberar</Button>
                  </Popconfirm>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Modal crear / editar */}
      <Modal
        open={modalOpen}
        title={editando ? `Editar Locker #${editando.numero}` : 'Nuevo Locker'}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditando(null); }}
        onOk={handleOk}
        confirmLoading={crearMut.isPending || editarMut.isPending}
        okText={editando ? 'Guardar' : 'Crear'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="numero" label="Número / Identificador" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="Ej: A-01" />
          </Form.Item>
          <Form.Item name="area" label="Área / Zona">
            <Input placeholder="Ej: Masculino, Femenino, General" />
          </Form.Item>
          {editando && (
            <Form.Item name="estado" label="Estado">
              <Select>
                {Object.entries(ESTADO_LABEL).map(([v, l]) => <Select.Option key={v} value={v}>{l}</Select.Option>)}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="precioMes" label="Precio mensual (RD$)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} step={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal asignar */}
      <Modal
        open={asignarOpen}
        title={`Asignar Locker #${lockers.find(l => l.id === lockerId)?.numero ?? ''}`}
        onCancel={() => { setAsignarOpen(false); formAsig.resetFields(); setLockerId(null); }}
        onOk={() => formAsig.validateFields().then(v => asignarMut.mutate({ lockerId, ...v }))}
        confirmLoading={asignarMut.isPending}
        destroyOnClose
      >
        <Form form={formAsig} layout="vertical">
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true, message: 'Selecciona un miembro' }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro">
              {miembros.map((m: any) => (
                <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
