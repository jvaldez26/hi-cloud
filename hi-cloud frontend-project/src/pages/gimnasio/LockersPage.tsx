import { useState } from 'react';
import { Row, Col, Card, Button, Tag, Modal, Form, Select, DatePicker, message, Popconfirm } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

const LOCKER_COLOR: Record<string, string> = { disponible: '#10b981', ocupado: '#3b82f6', mantenimiento: '#f59e0b', fuera_servicio: '#ef4444' };

export default function LockersPage() {
  const [estadoFiltro, setEstadoFiltro] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [lockerId, setLockerId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['gimnasio-lockers', estadoFiltro],
    queryFn: () => gimnasioApi.getLockers(estadoFiltro),
  });
  const lockers = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const asignarMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.asignarLocker(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-lockers'] }); message.success('Locker asignado'); setModalOpen(false); form.resetFields(); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const liberarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.liberarLocker(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gimnasio-lockers'] }); message.success('Locker liberado'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Lockers</h2>
        <Select style={{ width: 180 }} placeholder="Filtrar estado" allowClear value={estadoFiltro} onChange={v => setEstadoFiltro(v)}>
          {['disponible', 'ocupado', 'mantenimiento', 'fuera_servicio'].map(e => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
      </div>
      <Row gutter={[12, 12]}>
        {lockers.map((l: any) => (
          <Col key={l.id} xs={12} sm={8} md={6} lg={4}>
            <Card size="small" style={{ borderColor: LOCKER_COLOR[l.estado] ?? '#ccc', borderWidth: 2 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: LOCKER_COLOR[l.estado] }}>#{l.numero}</div>
              <Tag color={l.estado === 'disponible' ? 'green' : l.estado === 'ocupado' ? 'blue' : 'orange'} style={{ marginTop: 4 }}>
                {l.estado}
              </Tag>
              {l.miembroNombre && <div style={{ fontSize: 11, marginTop: 4 }}>{l.miembroNombre}</div>}
              <div style={{ marginTop: 8 }}>
                {l.estado === 'disponible' && (
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setLockerId(l.id); form.resetFields(); setModalOpen(true); }}>
                    Asignar
                  </Button>
                )}
                {l.estado === 'ocupado' && (
                  <Popconfirm title="Liberar este locker?" onConfirm={() => liberarMut.mutate(l.id)} okText="Si" cancelText="No">
                    <Button size="small" danger>Liberar</Button>
                  </Popconfirm>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Modal open={modalOpen} title={`Asignar Locker #${lockers.find((l: any) => l.id === lockerId)?.numero ?? ''}`}
        onCancel={() => { setModalOpen(false); form.resetFields(); setLockerId(null); }}
        onOk={() => form.validateFields().then(v => asignarMut.mutate({ lockerId, ...v, fechaAsignacion: v.fechaAsignacion?.format('YYYY-MM-DD') }))}
        confirmLoading={asignarMut.isPending}>
        <Form form={form} layout="vertical">
          <Form.Item name="miembroId" label="Miembro" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro">
              {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="fechaAsignacion" label="Fecha Asignacion"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
