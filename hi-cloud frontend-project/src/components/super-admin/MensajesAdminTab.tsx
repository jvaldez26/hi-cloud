import { useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker,
  Space, Tag, Typography, Popconfirm, Divider, Switch, Row, Col, Tooltip,
} from 'antd';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import {
  useMensajesAdmin,
  useCrearMensaje,
  useEditarMensaje,
  useDesactivarMensaje,
  useMensajeAdminStats,
} from '../../hooks/useMensajes';
import type { MensajeAdmin } from '../../api/mensajes.api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// ─── Vista previa del mensaje ─────────────────────────────────────────────────

function VistaPrevia({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  if (!titulo && !cuerpo) return null;
  return (
    <div style={{
      border:       '1px solid #d9d9d9',
      borderRadius:  6,
      padding:       16,
      background:   '#fafafa',
      marginTop:     8,
    }}>
      <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
        Vista previa
      </Text>
      {titulo && <div style={{ fontWeight: 600, marginTop: 6, fontSize: 14 }}>{titulo}</div>}
      {cuerpo  && <Paragraph style={{ margin: '6px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{cuerpo}</Paragraph>}
    </div>
  );
}

// ─── Stats modal ──────────────────────────────────────────────────────────────

function StatsModal({ id, titulo, onClose }: { id: string; titulo: string; onClose: () => void }) {
  const { data: stats, isLoading } = useMensajeAdminStats(id, !!id);
  return (
    <Modal open={!!id} title={`Estadísticas — ${titulo}`} onCancel={onClose} footer={null} width={400}>
      {isLoading
        ? <div style={{ textAlign: 'center', padding: 24 }}>Cargando...</div>
        : stats && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: 16, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{stats.totalLeidos}</div>
                  <Text type="secondary">Leídos</Text>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ textAlign: 'center', padding: 16, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>{stats.totalVistos}</div>
                  <Text type="secondary">Toast mostrado</Text>
                </div>
              </Col>
              <Col span={12} style={{ marginTop: 12 }}>
                <div style={{ textAlign: 'center', padding: 16, border: '1px solid #f0f0f0', borderRadius: 6 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#faad14' }}>{stats.totalArchivados}</div>
                  <Text type="secondary">Archivados</Text>
                </div>
              </Col>
            </Row>
          </Space>
        )
      }
    </Modal>
  );
}

// ─── Formulario de redacción ─────────────────────────────────────────────────

function MensajeForm({
  initial,
  onClose,
}: {
  initial?: MensajeAdmin | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const crear  = useCrearMensaje();
  const editar = useEditarMensaje();
  const watch  = Form.useWatch([], form);

  const titulo = watch?.titulo ?? '';
  const cuerpo = watch?.cuerpo ?? '';

  const onFinish = async (values: any) => {
    const payload = {
      ...values,
      fechaPublicacion: values.fechaPublicacion?.toISOString() ?? new Date().toISOString(),
      fechaExpiracion:  values.fechaExpiracion?.toISOString()  ?? undefined,
      destinatarioIds:  values.destinatario === 'lista'
        ? (values.destinatarioIds ?? []).map(Number)
        : undefined,
      destinatarioPlan: values.destinatario === 'plan' ? values.destinatarioPlan : undefined,
    };
    if (initial) {
      await editar.mutateAsync({ id: initial.id, payload });
    } else {
      await crear.mutateAsync(payload);
    }
    onClose();
  };

  const isLoading = crear.isPending || editar.isPending;

  return (
    <Modal
      open
      title={initial ? 'Editar mensaje' : 'Redactar mensaje'}
      onCancel={onClose}
      width={680}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initial ? {
          ...initial,
          fechaPublicacion: initial.fechaPublicacion ? dayjs(initial.fechaPublicacion) : undefined,
          fechaExpiracion:  initial.fechaExpiracion  ? dayjs(initial.fechaExpiracion)  : undefined,
        } : {
          tipo:          'aviso',
          destinatario:  'todas',
          activo:        true,
          fechaPublicacion: dayjs(),
        }}
      >
        <Form.Item name="titulo" label="Título" rules={[{ required: true, min: 3 }]}>
          <Input placeholder="Resumen en una línea" maxLength={200} showCount />
        </Form.Item>

        <Form.Item name="cuerpo" label="Cuerpo" rules={[{ required: true }]}>
          <TextArea
            rows={5}
            placeholder="Explica qué cambió y para qué le sirve al usuario. Escribe para el usuario final, no para el equipo técnico."
          />
        </Form.Item>

        <VistaPrevia titulo={titulo} cuerpo={cuerpo} />

        <Divider style={{ margin: '16px 0' }} />

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
              <Select options={[
                { value: 'aviso',   label: 'Aviso — comunicado operativo' },
                { value: 'novedad', label: 'Novedad — actualización del producto' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="destinatario" label="Destinatarios" rules={[{ required: true }]}>
              <Select options={[
                { value: 'todas', label: 'Todas las empresas' },
                { value: 'lista', label: 'Empresas específicas (por ID)' },
                { value: 'plan',  label: 'Por plan de suscripción' },
              ]} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item noStyle shouldUpdate={(p, c) => p.destinatario !== c.destinatario}>
          {({ getFieldValue }) => {
            const dest = getFieldValue('destinatario');
            if (dest === 'lista') return (
              <Form.Item name="destinatarioIds" label="IDs de empresas (separados por coma)">
                <Select mode="tags" tokenSeparators={[',']} placeholder="42, 57, 65" />
              </Form.Item>
            );
            if (dest === 'plan') return (
              <Form.Item name="destinatarioPlan" label="Plan" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'emprendedor', label: 'Emprendedor' },
                  { value: 'pyme',        label: 'PYME' },
                  { value: 'pro',         label: 'Pro' },
                  { value: 'plus',        label: 'Plus' },
                ]} />
              </Form.Item>
            );
            return null;
          }}
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="fechaPublicacion" label="Publicar el" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fechaExpiracion" label="Expira el (opcional)">
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {initial && (
          <Form.Item name="activo" label="Activo" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="primary" htmlType="submit" loading={isLoading}>
            {initial ? 'Guardar cambios' : 'Publicar mensaje'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

// ─── Tabla principal ─────────────────────────────────────────────────────────

export function MensajesAdminTab() {
  const [formMensaje, setFormMensaje] = useState<MensajeAdmin | null | false>(false);
  const [statsId, setStatsId]         = useState<{ id: string; titulo: string } | null>(null);

  const { data: mensajes = [], isLoading } = useMensajesAdmin();
  const desactivar = useDesactivarMensaje();

  const columns = [
    {
      title:     'Título',
      dataIndex: 'titulo',
      render:    (v: string, r: MensajeAdmin) => (
        <Space direction="vertical" size={2}>
          <Text strong={r.activo}>{v}</Text>
          {r.editadoEn && <Text type="secondary" style={{ fontSize: 11 }}>Editado</Text>}
          {!r.activo && <Tag color="default">Inactivo</Tag>}
        </Space>
      ),
    },
    {
      title:     'Tipo',
      dataIndex: 'tipo',
      width:     100,
      render:    (v: string) => (
        <Tag color={v === 'novedad' ? 'blue' : 'orange'}>
          {v === 'novedad' ? 'Novedad' : 'Aviso'}
        </Tag>
      ),
    },
    {
      title:     'Destinatarios',
      dataIndex: 'destinatario',
      width:     150,
      render:    (v: string, r: MensajeAdmin) => {
        if (v === 'todas') return <Tag>Todas las empresas</Tag>;
        if (v === 'plan')  return <Tag color="purple">{r.destinatarioPlan}</Tag>;
        return <Tag>{(r.destinatarioIds ?? []).length} empresa(s)</Tag>;
      },
    },
    {
      title:     'Publicación',
      dataIndex: 'fechaPublicacion',
      width:     160,
      render:    (v: string) => new Date(v).toLocaleDateString('es-DO', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
    },
    {
      title:     'Leídos',
      dataIndex: 'totalLeidos',
      width:     80,
      align:     'center' as const,
      render:    (v: number) => <Text type={v > 0 ? 'success' : 'secondary'}>{v}</Text>,
    },
    {
      title:  'Acciones',
      width:  120,
      render: (_: any, r: MensajeAdmin) => (
        <Space>
          <Tooltip title="Estadísticas">
            <Button
              type="text" size="small"
              icon={<Eye size={14} />}
              onClick={() => setStatsId({ id: r.id, titulo: r.titulo })}
            />
          </Tooltip>
          <Tooltip title="Editar">
            <Button
              type="text" size="small"
              icon={<Pencil size={14} />}
              onClick={() => setFormMensaje(r)}
            />
          </Tooltip>
          {r.activo && (
            <Popconfirm
              title="¿Desactivar este mensaje?"
              description="Dejará de verse en las bandejas."
              onConfirm={() => desactivar.mutate(r.id)}
            >
              <Button type="text" size="small" danger icon={<Trash2 size={14} />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Mensajes a clientes</Typography.Title>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => setFormMensaje(null)}>
          Redactar mensaje
        </Button>
      </div>

      <Table
        dataSource={mensajes}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 20 }}
      />

      {formMensaje !== false && (
        <MensajeForm
          initial={formMensaje}
          onClose={() => setFormMensaje(false)}
        />
      )}

      {statsId && (
        <StatsModal
          id={statsId.id}
          titulo={statsId.titulo}
          onClose={() => setStatsId(null)}
        />
      )}
    </div>
  );
}
