import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, Select, Switch, message, Typography, Tag, Descriptions, Alert,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import api from '../../api/client';

const { Title, Text } = Typography;

/**
 * Datos médicos de menores — el módulo más delicado del sistema. Esta
 * página solo es alcanzable por admin: el route ya está restringido en
 * menuConfig.ts (PATH_ROLES) y el backend lo vuelve a exigir con
 * @Roles(UserRole.ADMIN). No hay exportación a Excel aquí — si alguien
 * necesita el dato, que lo vea en pantalla.
 */

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 30_000,
  });
}

// ── Contexto médico del estudiante (alergias/condiciones) ────────────────────

function ContextoMedico({ estudianteId }: { estudianteId?: number }) {
  const { data } = useQuery<any>({
    queryKey: ['educativo', 'enfermeria', 'contexto-medico', estudianteId],
    queryFn: () => api.get(`/educativo/enfermeria/estudiante/${estudianteId}/contexto-medico`).then(r => r.data?.data ?? r.data),
    enabled: !!estudianteId,
  });
  if (!estudianteId || !data) return null;
  if (!data.tipoSangre && !data.alergias && !data.condicionesMedicas) {
    return <Alert type="info" showIcon message="Sin alergias ni condiciones médicas registradas para este estudiante" style={{ marginBottom: 16 }} />;
  }
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      message="Contexto médico del estudiante"
      description={
        <Descriptions size="small" column={1}>
          {data.tipoSangre && <Descriptions.Item label="Tipo de sangre">{data.tipoSangre}</Descriptions.Item>}
          {data.alergias && <Descriptions.Item label="Alergias">{data.alergias}</Descriptions.Item>}
          {data.condicionesMedicas && <Descriptions.Item label="Condiciones médicas">{data.condicionesMedicas}</Descriptions.Item>}
        </Descriptions>
      }
    />
  );
}

// ── Modal registrar visita ───────────────────────────────────────────────────

function VisitaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const estudianteId = Form.useWatch('estudianteId', form);
  const { data: estudiantes = [] } = useEdList('estudiantes', undefined);

  const mut = useMutation({
    mutationFn: (vals: any) => api.post('/educativo/enfermeria', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'enfermeria'] });
      message.success('Visita registrada');
      onClose();
    },
    onError: () => message.error('Error al registrar la visita'),
  });

  return (
    <Modal
      open={open}
      title="Registrar visita a enfermería"
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={560}
      destroyOnClose
      afterOpenChange={v => { if (!v) form.resetFields(); }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
          <Select showSearch
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
          />
        </Form.Item>

        <ContextoMedico estudianteId={estudianteId} />

        <Form.Item name="motivo" label="Motivo de la visita" rules={[{ required: true }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="sintomas" label="Síntomas">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="atencionBrindada" label="Atención brindada">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="medicamentoDado" label="Medicamento dado">
          <Input />
        </Form.Item>
        <Form.Item name="atendidoPor" label="Atendido por">
          <Input placeholder="Nombre de quien atendió" />
        </Form.Item>
        <Form.Item name="padresNotificados" label="¿Se notificó a los padres?" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="enviadoCasa" label="¿Se envió a casa?" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function EnfermeriaPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data = [], isLoading } = useEdList('enfermeria');

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Title level={4} style={{ margin: 0 }}>Enfermería</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Registrar visita
        </Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Registro de visitas a enfermería. Acceso restringido — datos médicos de menores.
      </Text>

      <Table dataSource={data} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} visitas` }}
        columns={[
          { title: 'Fecha', dataIndex: 'fecha', width: 140, render: (v: any) => v ? new Date(v).toLocaleString('es-DO') : '—' },
          { title: 'Estudiante', dataIndex: 'estudianteNombre' },
          { title: 'Motivo', dataIndex: 'motivo', ellipsis: true },
          { title: 'Medicamento', dataIndex: 'medicamentoDado', render: (v: any) => v ?? '—' },
          { title: 'Padres', dataIndex: 'padresNotificados', width: 80, align: 'center', render: (v: boolean) => v ? <Tag color="green">Sí</Tag> : <Tag>No</Tag> },
          { title: 'Enviado a casa', dataIndex: 'enviadoCasa', width: 110, align: 'center', render: (v: boolean) => v ? <Tag color="orange">Sí</Tag> : <Tag>No</Tag> },
          { title: 'Atendido por', dataIndex: 'atendidoPor', render: (v: any) => v ?? '—' },
        ]}
      />

      <VisitaModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
