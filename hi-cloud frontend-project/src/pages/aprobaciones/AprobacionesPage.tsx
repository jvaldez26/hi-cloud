import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Table, Tag, Button, Modal, Form, Input,
  Select, Space, Typography, message, Badge, Tabs, theme,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, PlusOutlined, SearchOutlined, ExportOutlined,
} from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { aprobacionesApi } from '../../api/aprobaciones.api';
import type { DocAprobacion } from '../../api/aprobaciones.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  cotizacion:  { label: 'Cotización',   color: 'blue'   },
  pre_factura: { label: 'Pre-Factura',  color: 'cyan'   },
  compra:      { label: 'Compra',       color: 'purple' },
  gasto:       { label: 'Gasto',        color: 'orange' },
  nota_debito: { label: 'Nota Débito',  color: 'gold'   },
  otro:        { label: 'Otro',         color: 'default' },
};

const TIPO_RUTA: Record<string, (id: number) => string | null> = {
  cotizacion:  () => '/cotizaciones',
  compra:      (id) => `/compras/${id}`,
  pre_factura: (id) => `/pre-facturas/${id}`,
  nota_debito: (id) => `/notas-debito/${id}`,
  gasto:       () => '/gastos',
};

const ESTADO_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pendiente: { color: 'orange', label: 'Pendiente', icon: <ClockCircleOutlined /> },
  aprobado:  { color: 'green',  label: 'Aprobado',  icon: <CheckCircleOutlined /> },
  rechazado: { color: 'red',    label: 'Rechazado', icon: <CloseCircleOutlined /> },
};

type TabKey = 'pendientes' | 'aprobadas' | 'rechazadas' | 'todas';

const TAB_ESTADO: Record<TabKey, string | undefined> = {
  pendientes: 'pendiente',
  aprobadas:  'aprobado',
  rechazadas: 'rechazado',
  todas:      undefined,
};

export default function AprobacionesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // ── Estado UI ──────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [tabActiva,     setTabActiva]     = useState<TabKey>('pendientes');
  const [modalSolicitud, setModalSolicitud] = useState(false);
  const [modalResolver,  setModalResolver]  = useState<{ id: number; accion: 'aprobar' | 'rechazar' } | null>(null);
  const [formRes] = Form.useForm();

  // ── Estado para el autocomplete de documentos ──────────────────────────────
  const [tipoSol,         setTipoSol]         = useState<string | undefined>();
  const [docBusqueda,     setDocBusqueda]     = useState('');
  const [docSeleccionado, setDocSeleccionado] = useState<DocAprobacion | null>(null);
  const [comentarioSol,   setComentarioSol]   = useState('');

  // ── Datos ──────────────────────────────────────────────────────────────────
  const { data: resumen } = useQuery({
    queryKey: ['aprobaciones-resumen'],
    queryFn:  aprobacionesApi.resumen,
  });

  const estadoFiltro = TAB_ESTADO[tabActiva];

  const { data: aprobaciones, isLoading } = useQuery({
    queryKey: ['aprobaciones', tabActiva],
    queryFn:  () => aprobacionesApi.list(estadoFiltro, 100),
  });

  const { data: docsEncontrados, isFetching: buscandoDocs } = useQuery<DocAprobacion[]>({
    queryKey: ['aprobacion-docs', tipoSol, docBusqueda],
    queryFn:  () => aprobacionesApi.buscarDocumento(tipoSol!, docBusqueda),
    enabled:  !!tipoSol,
    staleTime: 30_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const solicitar = useMutation({
    mutationFn: () =>
      aprobacionesApi.solicitar({
        tipo:                tipoSol!,
        entidadId:           docSeleccionado!.id,
        entidadRef:          docSeleccionado!.ref,
        monto:               docSeleccionado!.monto,
        comentarioSolicitud: comentarioSol || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['aprobaciones-resumen'] });
      cerrarModalSolicitud();
      message.success('Solicitud enviada');
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const resolver = useMutation({
    mutationFn: ({ id, accion, comentario }: { id: number; accion: string; comentario?: string }) =>
      accion === 'aprobar'
        ? aprobacionesApi.aprobar(id, comentario)
        : aprobacionesApi.rechazar(id, comentario ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['aprobaciones-resumen'] });
      setModalResolver(null);
      formRes.resetFields();
      message.success('Resolución guardada');
    },
    onError: (e: any) =>
      message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const cerrarModalSolicitud = () => {
    setModalSolicitud(false);
    setTipoSol(undefined);
    setDocBusqueda('');
    setDocSeleccionado(null);
    setComentarioSol('');
  };

  const items = Array.isArray(aprobaciones) ? aprobaciones : (aprobaciones?.data ?? []);

  const itemsFiltrados = useMemo(
    () =>
      items.filter((i: any) =>
        !search ||
        String(i.nombreSolicitante ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(i.entidadRef ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(i.tipo ?? '').toLowerCase().includes(search.toLowerCase()),
      ),
    [items, search],
  );

  // ── Columnas ───────────────────────────────────────────────────────────────
  const COLS_DEF = [
    { key: 't',   label: 'Tipo',           defaultVisible: true  },
    { key: 'ref', label: 'Referencia',      defaultVisible: true  },
    { key: 'm',   label: 'Monto',          defaultVisible: true  },
    { key: 'ns',  label: 'Solicitado por', defaultVisible: true  },
    { key: 'cs',  label: 'Motivo',         defaultVisible: true  },
    { key: 'e',   label: 'Estado',         defaultVisible: true  },
    { key: 'cr',  label: 'Resolución',     defaultVisible: false },
    { key: 'fa',  label: 'Fecha',          defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('aprobaciones', COLS_DEF);

  const cols = [
    {
      title: 'Tipo', dataIndex: 'tipo', key: 't',
      render: (v: string) => <Tag color={TIPO_LABELS[v]?.color}>{TIPO_LABELS[v]?.label ?? v}</Tag>,
    },
    {
      title: 'Referencia', dataIndex: 'entidadRef', key: 'ref',
      render: (v: string, r: any) => {
        const ruta = TIPO_RUTA[r.tipo]?.(r.entidadId);
        return v ? (
          <Space size={4}>
            <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>
            {ruta && (
              <Tooltip title="Ver documento">
                <Button
                  type="link" size="small" icon={<ExportOutlined />}
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => navigate(ruta)}
                />
              </Tooltip>
            )}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: 'Monto', dataIndex: 'monto', key: 'm', align: 'right' as const,
      render: (v: any) => v ? <Text>{fmt.money(Number(v))}</Text> : <Text type="secondary">—</Text>,
    },
    { title: 'Solicitado por', dataIndex: 'nombreSolicitante', key: 'ns' },
    {
      title: 'Motivo', dataIndex: 'comentarioSolicitud', key: 'cs',
      render: (v: any) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>{String(v).slice(0, 60)}{String(v).length > 60 ? '…' : ''}</Text>
        ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'e',
      render: (v: string) => {
        const conf = ESTADO_CONFIG[v];
        return conf ? <Tag color={conf.color} icon={conf.icon}>{conf.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    {
      title: 'Resolución', dataIndex: 'comentarioResolucion', key: 'cr',
      render: (v: any) =>
        v ? (
          <Text type="secondary" style={{ fontSize: 12 }}>{String(v).slice(0, 50)}{String(v).length > 50 ? '…' : ''}</Text>
        ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'fa',
      render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{fmt.date(v)}</Text> : '—',
    },
    {
      title: '', key: 'acc', width: 72, align: 'right' as const,
      render: (_: any, r: any) =>
        r.estado === 'pendiente' ? (
          <TableActions
            items={[
              {
                key: 'aprobar', label: 'Aprobar', icon: <CheckCircleOutlined />,
                onClick: () => setModalResolver({ id: r.id, accion: 'aprobar' }),
              },
              { type: 'divider' as const },
              {
                key: 'rechazar', label: 'Rechazar', danger: true, icon: <CloseCircleOutlined />,
                onClick: () => setModalResolver({ id: r.id, accion: 'rechazar' }),
              },
            ]}
          />
        ) : null,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: 'pendientes',
      label: (
        <Badge count={resumen?.pendientes ?? 0} offset={[6, 0]} color={token.colorWarning}>
          <span style={{ paddingRight: 4 }}>Pendientes</span>
        </Badge>
      ),
    },
    {
      key: 'aprobadas',
      label: (
        <Badge count={resumen?.aprobados ?? 0} offset={[6, 0]} color={token.colorSuccess}>
          <span style={{ paddingRight: 4 }}>Aprobadas</span>
        </Badge>
      ),
    },
    {
      key: 'rechazadas',
      label: (
        <Badge count={resumen?.rechazados ?? 0} offset={[6, 0]} color={token.colorError}>
          <span style={{ paddingRight: 4 }}>Rechazadas</span>
        </Badge>
      ),
    },
    { key: 'todas', label: 'Todas' },
  ];

  const docOptions = (docsEncontrados ?? []).map(d => ({
    value: d.id,
    label: `${d.ref}${d.extra ? ` — ${d.extra}` : ''}`,
    doc:   d,
  }));

  const canSubmitSolicitud = !!tipoSol && !!docSeleccionado;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileTextOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Aprobaciones</Title>
            <Text type="secondary">Flujo de aprobación para cotizaciones, compras y gastos</Text>
          </div>
        </div>
        <Space>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['aprobaciones']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSolicitud(true)}>
            Nueva Solicitud
          </Button>
        </Space>
      </div>

      {/* Barra de búsqueda */}
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="Buscar por solicitante, referencia o módulo..."
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
      </div>

      {/* Tabla con tabs */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={tabActiva}
          onChange={k => setTabActiva(k as TabKey)}
          items={tabItems}
        />
        <Table
          dataSource={itemsFiltrados}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15, showSizeChanger: false }}
          columns={filterColumns(cols)}
        />
      </Card>

      {/* ── Modal Nueva Solicitud ─────────────────────────────────────────────── */}
      <Modal
        title={<><PlusOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />Nueva Solicitud de Aprobación</>}
        open={modalSolicitud}
        onCancel={cerrarModalSolicitud}
        onOk={() => solicitar.mutate()}
        okButtonProps={{ disabled: !canSubmitSolicitud, loading: solicitar.isPending }}
        okText="Enviar Solicitud"
        destroyOnClose
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {/* Tipo */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Tipo de documento <Text type="danger">*</Text>
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Seleccionar tipo..."
              value={tipoSol}
              onChange={v => {
                setTipoSol(v);
                setDocSeleccionado(null);
                setDocBusqueda('');
              }}
              options={Object.entries(TIPO_LABELS).map(([k, v]) => ({
                value: k,
                label: <Tag color={v.color}>{v.label}</Tag>,
              }))}
            />
          </div>

          {/* Documento (autocomplete) */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Documento <Text type="danger">*</Text>
            </Text>
            <Select
              style={{ width: '100%' }}
              showSearch
              filterOption={false}
              disabled={!tipoSol}
              loading={buscandoDocs}
              placeholder={tipoSol ? 'Escribir número, folio o nombre...' : 'Primero selecciona el tipo'}
              value={docSeleccionado?.id ?? undefined}
              onSearch={v => setDocBusqueda(v)}
              onChange={(val) => {
                const opt = docOptions.find(o => o.value === val);
                setDocSeleccionado(opt?.doc ?? null);
              }}
              options={docOptions}
              notFoundContent={
                buscandoDocs
                  ? 'Buscando...'
                  : docBusqueda
                  ? 'Sin resultados'
                  : 'Escribe para buscar'
              }
            />
            {/* Vista previa del documento seleccionado */}
            {docSeleccionado && (
              <div style={{
                marginTop: 8, padding: '8px 12px', background: token.colorFillTertiary,
                borderRadius: 6, fontSize: 12,
              }}>
                <Space size="large">
                  <span>
                    <Text type="secondary">Ref: </Text>
                    <Text strong style={{ fontFamily: 'monospace' }}>{docSeleccionado.ref}</Text>
                  </span>
                  {docSeleccionado.extra && (
                    <span>
                      <Text type="secondary">Documento: </Text>
                      <Text>{docSeleccionado.extra}</Text>
                    </span>
                  )}
                  {docSeleccionado.monto > 0 && (
                    <span>
                      <Text type="secondary">Total: </Text>
                      <Text strong style={{ color: token.colorPrimary }}>{fmt.money(docSeleccionado.monto)}</Text>
                    </span>
                  )}
                </Space>
              </div>
            )}
          </div>

          {/* Motivo */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Motivo de la solicitud (opcional)
            </Text>
            <Input.TextArea
              rows={3}
              placeholder="Describe por qué necesita aprobación..."
              value={comentarioSol}
              onChange={e => setComentarioSol(e.target.value)}
              maxLength={500}
              showCount
            />
          </div>
        </Space>
      </Modal>

      {/* ── Modal Resolver ───────────────────────────────────────────────────── */}
      <Modal
        title={
          modalResolver?.accion === 'aprobar'
            ? <><CheckCircleOutlined style={{ color: token.colorSuccess, marginRight: 8 }} />Aprobar Solicitud</>
            : <><CloseCircleOutlined style={{ color: token.colorError,   marginRight: 8 }} />Rechazar Solicitud</>
        }
        open={!!modalResolver}
        onCancel={() => { setModalResolver(null); formRes.resetFields(); }}
        onOk={() => formRes.submit()}
        confirmLoading={resolver.isPending}
        okText={modalResolver?.accion === 'aprobar' ? 'Confirmar Aprobación' : 'Confirmar Rechazo'}
        okButtonProps={{
          style: modalResolver?.accion === 'aprobar'
            ? { background: token.colorSuccess, borderColor: token.colorSuccess }
            : { background: token.colorError,   borderColor: token.colorError   },
        }}
        destroyOnClose
      >
        <Form
          form={formRes}
          layout="vertical"
          onFinish={v =>
            resolver.mutate({
              id:        modalResolver!.id,
              accion:    modalResolver!.accion,
              comentario: v.comentario,
            })
          }
        >
          <Form.Item
            name="comentario"
            label="Comentario"
            rules={
              modalResolver?.accion === 'rechazar'
                ? [{ required: true, message: 'Indica el motivo del rechazo' }]
                : []
            }
          >
            <Input.TextArea
              rows={3}
              placeholder={
                modalResolver?.accion === 'aprobar'
                  ? 'Observaciones (opcional)...'
                  : 'Motivo del rechazo (obligatorio)...'
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
