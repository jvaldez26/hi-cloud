import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Checkbox,
} from 'antd';
import { PlusOutlined, EditOutlined, PrinterOutlined } from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';
import { imprimirHtml } from '../../utils/printUtils';

const { Title, Text } = Typography;

const DESTINATARIO_OPTS = [
  { value: 'todos',      label: 'Todos los estudiantes' },
  { value: 'grado',      label: 'Un grado' },
  { value: 'seccion',    label: 'Una sección' },
  { value: 'individual', label: 'Un estudiante' },
];

function useEdList(path: string, params?: any) {
  return useQuery<any[]>({
    queryKey: ['educativo', path, params],
    queryFn: () => api.get(`/educativo/${path}`, { params }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });
}

function destinatarioLabel(r: any) {
  switch (r.destinatarioTipo) {
    case 'todos':      return 'Todos los estudiantes';
    case 'grado':      return `Grado: ${r.gradoNombre ?? '—'}`;
    case 'seccion':    return `Sección: ${r.seccionNombre ?? '—'}`;
    case 'individual': return `Estudiante: ${r.estudianteNombre ?? '—'}`;
    default:           return r.destinatarioTipo ?? '—';
  }
}

function imprimirComunicado(r: any) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${r.titulo}</title>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; padding: 40px; color: #111; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
      .contenido { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    </style>
  </head><body>
    <h1>${r.titulo}</h1>
    <div class="meta">
      Para: ${destinatarioLabel(r)} · ${dayjs(r.fechaEnvio).format('DD/MM/YYYY HH:mm')}
      ${r.creadoPor ? ` · ${r.creadoPor}` : ''}
    </div>
    <div class="contenido">${r.contenido}</div>
  </body></html>`;
  imprimirHtml(html);
}

// ── Modal crear/editar ───────────────────────────────────────────────────────

function ComunicadoModal({ open, editing, onClose }: { open: boolean; editing?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const destinatarioTipo = Form.useWatch('destinatarioTipo', form);
  const { data: grados = [] } = useEdList('grados');
  const { data: secciones = [] } = useEdList('secciones');
  const { data: estudiantes = [] } = useEdList('estudiantes');

  const mut = useMutation({
    mutationFn: (vals: any) => editing
      ? api.patch(`/educativo/comunicados/${editing.id}`, vals)
      : api.post('/educativo/comunicados', vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educativo', 'comunicados'] });
      message.success('Guardado');
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Editar comunicado' : 'Nuevo comunicado'}
      onCancel={onClose}
      onOk={() => form.validateFields().then(v => mut.mutate(v))}
      confirmLoading={mut.isPending}
      width={600}
      destroyOnClose
      afterOpenChange={visible => {
        if (visible) form.setFieldsValue(editing ?? { destinatarioTipo: 'todos' });
        else form.resetFields();
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="titulo" label="Título" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="contenido" label="Contenido" rules={[{ required: true }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
        <Form.Item name="destinatarioTipo" label="Destinatario" rules={[{ required: true }]}>
          <Select options={DESTINATARIO_OPTS} />
        </Form.Item>
        {destinatarioTipo === 'grado' && (
          <Form.Item name="gradoId" label="Grado" rules={[{ required: true }]}>
            <Select options={grados.map((g: any) => ({ value: g.id, label: g.nombre }))} />
          </Form.Item>
        )}
        {destinatarioTipo === 'seccion' && (
          <Form.Item name="seccionId" label="Sección" rules={[{ required: true }]}>
            <Select options={secciones.map((s: any) => ({ value: s.id, label: s.nombre }))} />
          </Form.Item>
        )}
        {destinatarioTipo === 'individual' && (
          <Form.Item name="estudianteId" label="Estudiante" rules={[{ required: true }]}>
            <Select showSearch
              filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
              options={estudiantes.map((e: any) => ({ value: e.id, label: `${e.apellidos}, ${e.nombres}` }))}
            />
          </Form.Item>
        )}
        <Space size="large">
          <Form.Item name="enviarWhatsapp" valuePropName="checked" noStyle>
            <Checkbox>Enviar por WhatsApp</Checkbox>
          </Form.Item>
          <Form.Item name="enviarEmail" valuePropName="checked" noStyle>
            <Checkbox>Enviar por email</Checkbox>
          </Form.Item>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
          El envío por WhatsApp/email todavía no está conectado — el comunicado se registra y se puede imprimir.
        </Text>
      </Form>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ComunicadosPage() {
  const [filtroDestinatario, setFiltroDestinatario] = useState<string | undefined>();
  const { data = [], isLoading } = useEdList('comunicados', { destinatarioTipo: filtroDestinatario });
  const [modal, setModal] = useState<{ open: boolean; editing?: any }>({ open: false });

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Title level={4} style={{ margin: 0 }}>Comunicados</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true })}>
          Nuevo comunicado
        </Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        El envío por WhatsApp y email no está conectado todavía — el comunicado se registra, se ve aquí y se puede imprimir.
      </Text>

      <Select
        id="filtroDestinatario"
        style={{ width: 220, marginBottom: 12 }} allowClear placeholder="Filtrar por destinatario"
        options={DESTINATARIO_OPTS} onChange={setFiltroDestinatario}
      />

      <Table dataSource={data} rowKey="id" loading={isLoading} size="small" scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, showTotal: t => `${t} comunicados` }}
        columns={[
          { title: 'Fecha', dataIndex: 'fechaEnvio', width: 140, render: (v: any) => dayjs(v).format('DD/MM/YYYY HH:mm') },
          { title: 'Título', dataIndex: 'titulo' },
          { title: 'Destinatario', key: 'dest', render: (_: any, r: any) => <Tag>{destinatarioLabel(r)}</Tag> },
          {
            title: 'Canales', key: 'canales',
            render: (_: any, r: any) => (
              <Space size={4}>
                {r.enviarWhatsapp && <Tag color="green">WhatsApp</Tag>}
                {r.enviarEmail && <Tag color="blue">Email</Tag>}
                {!r.enviarWhatsapp && !r.enviarEmail && <Tag>Solo pantalla</Tag>}
              </Space>
            ),
          },
          { title: 'Creado por', dataIndex: 'creadoPor', render: (v: any) => v ?? '—' },
          {
            title: '', key: 'a', width: 100,
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<PrinterOutlined />} onClick={() => imprimirComunicado(r)} />
                <Button size="small" icon={<EditOutlined />} onClick={() => setModal({ open: true, editing: r })} />
              </Space>
            ),
          },
        ]}
      />

      <ComunicadoModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false })} />
    </div>
  );
}
