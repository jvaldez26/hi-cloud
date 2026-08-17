import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, InputNumber,
  Switch, Tag, Popconfirm, message, Space, Tooltip, Empty,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  PlayCircleOutlined, EyeOutlined, LinkOutlined,
  DragOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VideoTutorial {
  id:               number;
  modulo:           string;
  titulo:           string;
  descripcion:      string | null;
  proveedor:        'youtube' | 'vimeo';
  videoId:          string;
  duracionSegundos: number | null;
  orden:            number;
  activo:           boolean;
  createdAt:        string;
  updatedAt:        string;
}

type VideoForm = Omit<VideoTutorial, 'id' | 'createdAt' | 'updatedAt'>;

// 83 claves de módulo
const MODULOS_CLAVES = [
  'activos-fijos','agro','almacenes','anticipos-cliente','aprobaciones','auditoria',
  'bancos','caja','caja-chica','capacitacion','centro-costos','cheques','clientes',
  'clinica','comisiones','compras','comunicaciones','conduce','contabilidad','contactos',
  'contratos','cotizaciones','credito-cliente','crm','cuentas-estadisticas','cuotas',
  'cxc','cxp','datafono','declaraciones','depositos','descuentos','devoluciones',
  'divisas','documentos','ecf','empresas','encuestas','equipo','etiquetas','evaluaciones',
  'facturas','farmacia','fidelidad','flota','gastos','gimnasio','grupos','importacion',
  'inventario','isr','libro-ventas','licitaciones','mantenimiento','manufactura','nomina',
  'notas-credito','notas-credito-compras','notas-debito','objetivos','optica','pre-factura',
  'precios','prestamista','presupuestos','pro-formas','productos','proveedores','proyectos',
  'recibos-cobro','reportes','restaurante','retenciones','servicios','servicios-pro',
  'solicitudes-compra','sucursales','taller','tesoreria','tss','uom','vacaciones',
  'valoracion-stock','vendedores',
];

// ── URL → videoId extractor ───────────────────────────────────────────────────

function extractVideoId(url: string): { proveedor: 'youtube' | 'vimeo'; videoId: string } | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());

    // YouTube: youtu.be/ID  o  youtube.com/watch?v=ID  o  youtube.com/embed/ID
    if (u.hostname === 'youtu.be') {
      return { proveedor: 'youtube', videoId: u.pathname.slice(1).split('?')[0] };
    }
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v')
        || (u.pathname.startsWith('/embed/') ? u.pathname.split('/embed/')[1]?.split('?')[0] : null)
        || (u.pathname.startsWith('/shorts/') ? u.pathname.split('/shorts/')[1]?.split('?')[0] : null);
      if (v) return { proveedor: 'youtube', videoId: v };
    }

    // Vimeo: vimeo.com/ID  o  player.vimeo.com/video/ID
    if (u.hostname.includes('vimeo.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const idPart = u.hostname.startsWith('player.')
        ? (parts[1] ?? parts[0])   // /video/ID
        : parts[0];               // /ID
      if (idPart && /^\d+$/.test(idPart)) return { proveedor: 'vimeo', videoId: idPart };
    }
  } catch {
    // URL inválida — intentar regex en texto crudo
    const ytMatch = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) return { proveedor: 'youtube', videoId: ytMatch[1] };
    const vmMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vmMatch) return { proveedor: 'vimeo', videoId: vmMatch[1] };
  }
  return null;
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ open, onClose, proveedor, videoId, titulo }: {
  open: boolean; onClose: () => void;
  proveedor: 'youtube' | 'vimeo'; videoId: string; titulo?: string;
}) {
  const src = proveedor === 'youtube'
    ? `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`
    : `https://player.vimeo.com/video/${videoId}?autoplay=0&dnt=1`;

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} title={titulo || 'Vista previa'} destroyOnClose>
      <div style={{ position: 'relative', paddingTop: '56.25%' }}>
        <iframe
          src={src}
          title={titulo || 'preview'}
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </Modal>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  C: Record<string, string>;
}

export default function VideosTutorialesAdminPage({ C }: Props) {
  const qc = useQueryClient();
  const [form] = Form.useForm<VideoForm>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{ proveedor: 'youtube' | 'vimeo'; videoId: string; titulo: string } | null>(null);
  const [urlInput, setUrlInput] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: videos = [], isLoading } = useQuery<VideoTutorial[]>({
    queryKey: ['admin-videos-tutoriales'],
    queryFn:  async () => {
      const res = await api.get<VideoTutorial[]>('/videos-tutoriales');
      return res.data;
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  const inval = () => {
    qc.invalidateQueries({ queryKey: ['admin-videos-tutoriales'] });
    qc.invalidateQueries({ queryKey: ['videos-tutoriales-publico'] });
  };

  const crear = useMutation({
    mutationFn: (dto: VideoForm) => api.post('/videos-tutoriales', dto),
    onSuccess: () => { message.success('Video creado'); closeModal(); inval(); },
    onError:   (e: any) => message.error(e.response?.data?.errors?.[0] ?? 'Error al crear'),
  });

  const actualizar = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: VideoForm }) => api.put(`/videos-tutoriales/${id}`, dto),
    onSuccess: () => { message.success('Video actualizado'); closeModal(); inval(); },
    onError:   (e: any) => message.error(e.response?.data?.errors?.[0] ?? 'Error al actualizar'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/videos-tutoriales/${id}`),
    onSuccess: () => { message.success('Video eliminado'); inval(); },
    onError:   (e: any) => message.error(e.response?.data?.errors?.[0] ?? 'Error al eliminar'),
  });

  const toggleActivo = useMutation({
    mutationFn: (id: number) => api.patch(`/videos-tutoriales/${id}/toggle-activo`),
    onSuccess: inval,
    onError:   (e: any) => message.error(e.response?.data?.errors?.[0] ?? 'Error'),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  function openCrear() {
    setEditingId(null);
    setUrlInput('');
    form.resetFields();
    setModalOpen(true);
  }

  function openEditar(v: VideoTutorial) {
    setEditingId(v.id);
    setUrlInput('');
    form.setFieldsValue({
      modulo:           v.modulo,
      titulo:           v.titulo,
      descripcion:      v.descripcion ?? undefined,
      proveedor:        v.proveedor,
      videoId:          v.videoId,
      duracionSegundos: v.duracionSegundos ?? undefined,
      orden:            v.orden,
      activo:           v.activo,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setUrlInput('');
    form.resetFields();
  }

  function handleUrlPaste(val: string) {
    setUrlInput(val);
    const extracted = extractVideoId(val);
    if (extracted) {
      form.setFieldsValue({ proveedor: extracted.proveedor, videoId: extracted.videoId });
      message.success(`Detectado: ${extracted.proveedor} · ID: ${extracted.videoId}`);
    }
  }

  function handlePreview() {
    const proveedor = form.getFieldValue('proveedor');
    const videoId   = form.getFieldValue('videoId');
    const titulo    = form.getFieldValue('titulo') || 'Vista previa';
    if (!proveedor || !videoId) {
      message.warning('Completa el proveedor y el ID del video primero');
      return;
    }
    setPreviewData({ proveedor, videoId, titulo });
    setPreviewOpen(true);
  }

  function onFinish(vals: VideoForm) {
    const dto: VideoForm = {
      ...vals,
      orden:  vals.orden  ?? 0,
      activo: vals.activo ?? true,
    };
    if (editingId !== null) {
      actualizar.mutate({ id: editingId, dto });
    } else {
      crear.mutate(dto);
    }
  }

  // Módulos ya usados (para excluir del select al crear)
  const modulosUsados = new Set(videos.map(v => v.modulo));
  const opcionesModulo = MODULOS_CLAVES
    .filter(m => editingId !== null || !modulosUsados.has(m))
    .map(m => ({ value: m, label: m }));

  // ── Tabla ─────────────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Módulo', dataIndex: 'modulo', key: 'modulo',
      render: (m: string) => <code style={{ fontSize: 12, background: `${C.border}55`, padding: '2px 6px', borderRadius: 4 }}>{m}</code>,
    },
    {
      title: 'Título', dataIndex: 'titulo', key: 'titulo',
      render: (t: string) => <span style={{ color: C.txt }}>{t}</span>,
    },
    {
      title: 'Plataforma', dataIndex: 'proveedor', key: 'proveedor',
      width: 110,
      render: (p: string) => (
        <Tag color={p === 'youtube' ? 'red' : 'blue'}>{p === 'youtube' ? '▶ YouTube' : 'V Vimeo'}</Tag>
      ),
    },
    {
      title: 'Duración', dataIndex: 'duracionSegundos', key: 'duracion',
      width: 90,
      render: (s: number | null) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : <span style={{ color: C.txt2 }}>—</span>,
    },
    {
      title: 'Orden', dataIndex: 'orden', key: 'orden', width: 70,
      render: (n: number) => <span style={{ color: C.txt2 }}>{n}</span>,
    },
    {
      title: 'Activo', dataIndex: 'activo', key: 'activo', width: 80,
      render: (a: boolean, row: VideoTutorial) => (
        <Switch
          size="small"
          checked={a}
          loading={toggleActivo.isPending}
          onChange={() => toggleActivo.mutate(row.id)}
        />
      ),
    },
    {
      title: 'Acciones', key: 'acciones', width: 120,
      render: (_: any, row: VideoTutorial) => (
        <Space size={4}>
          <Tooltip title="Vista previa">
            <Button
              size="small" type="text" icon={<EyeOutlined />}
              onClick={() => { setPreviewData({ proveedor: row.proveedor, videoId: row.videoId, titulo: row.titulo }); setPreviewOpen(true); }}
            />
          </Tooltip>
          <Tooltip title="Editar">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditar(row)} />
          </Tooltip>
          <Popconfirm
            title="¿Eliminar este video tutorial?"
            onConfirm={() => eliminar.mutate(row.id)}
            okText="Eliminar" cancelText="Cancelar" okType="danger"
          >
            <Tooltip title="Eliminar">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 18, margin: 0 }}>
            <PlayCircleOutlined style={{ color: C.blue, marginRight: 8 }} />
            Videos Tutoriales
          </h3>
          <p style={{ color: C.txt2, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {videos.length} de 83 módulos con video · Los botones se ocultan si no hay video activo
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCrear}
          disabled={modulosUsados.size >= MODULOS_CLAVES.length}
        >
          Agregar video
        </Button>
      </div>

      {/* Tabla */}
      <Table
        dataSource={videos}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        locale={{ emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ color: C.txt2 }}>Sin videos aún — agrega el primero</span>}
          />
        )}}
        style={{ background: C.bg }}
      />

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        title={editingId ? 'Editar video tutorial' : 'Nuevo video tutorial'}
        width={580}
        destroyOnClose
      >
        {/* URL rápida */}
        <div style={{ marginBottom: 16, padding: 12, background: '#F0F9FF', borderRadius: 8, border: '1px solid #BAE6FD' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0369A1', marginBottom: 6 }}>
            <LinkOutlined style={{ marginRight: 4 }} />
            Pegar URL del video (auto-extrae ID y plataforma)
          </div>
          <Input
            placeholder="https://www.youtube.com/watch?v=... o https://vimeo.com/..."
            value={urlInput}
            onChange={e => handleUrlPaste(e.target.value)}
            allowClear
          />
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="modulo"
            label="Módulo"
            rules={[{ required: true, message: 'Selecciona el módulo' }]}
          >
            <Select
              showSearch
              placeholder="Selecciona el módulo del ERP"
              options={opcionesModulo}
              filterOption={(input, opt) => (opt?.value ?? '').includes(input.toLowerCase())}
            />
          </Form.Item>

          <Form.Item
            name="titulo"
            label="Título"
            rules={[{ required: true, message: 'Ingresa el título' }]}
          >
            <Input placeholder="Ej: Módulo de Clientes — Guía completa" maxLength={200} />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción (opcional)">
            <Input.TextArea rows={2} placeholder="Breve descripción del contenido..." maxLength={1000} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item
              name="proveedor"
              label="Plataforma"
              rules={[{ required: true, message: 'Selecciona la plataforma' }]}
            >
              <Select options={[{ value: 'youtube', label: '▶ YouTube' }, { value: 'vimeo', label: 'V Vimeo' }]} />
            </Form.Item>

            <Form.Item
              name="videoId"
              label="ID del video"
              rules={[{ required: true, message: 'Ingresa el ID del video' }]}
              extra="Solo el ID, no la URL completa"
            >
              <Input placeholder="dQw4w9WgXcQ" maxLength={100} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="duracionSegundos" label="Duración (seg)">
              <InputNumber min={1} placeholder="480" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="orden" label="Orden">
              <InputNumber min={0} defaultValue={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="activo" label="Activo" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button icon={<EyeOutlined />} onClick={handlePreview}>
              Vista previa
            </Button>
            <Button onClick={closeModal}>Cancelar</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={crear.isPending || actualizar.isPending}
            >
              {editingId ? 'Guardar cambios' : 'Crear video'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Preview modal */}
      {previewData && (
        <PreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          proveedor={previewData.proveedor}
          videoId={previewData.videoId}
          titulo={previewData.titulo}
        />
      )}
    </div>
  );
}
