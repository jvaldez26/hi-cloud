import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import {
  Tabs, Table, Button, Tag, Card, Row, Col, Typography, Modal,
  Form, Input, InputNumber, Select, Space, Alert, message,
  Badge, Drawer, Descriptions, Tooltip, Popconfirm, theme } from 'antd';
import {
  ReloadOutlined, DownloadOutlined, SendOutlined,
  WarningOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, PlusOutlined, EditOutlined, StopOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ecfApi } from '../../api/ecf.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const estadoDGIIColor: Record<string, string> = {
  pendiente:       'orange',
  pendiente_envio: 'orange',
  enviado:         'blue',
  aceptado:        'green',
  rechazado:       'red',
  condicionado:    'gold',
  observado:       'gold',
  contingencia:    'purple',
};

const estadoDGIIIcon: Record<string, React.ReactNode> = {
  pendiente_envio: <ClockCircleOutlined />,
  enviado:         <ClockCircleOutlined />,
  aceptado:        <CheckCircleOutlined />,
  rechazado:       <CloseCircleOutlined />,
  condicionado:    <WarningOutlined />,
};

// ── Tab: Lista de e-CFs ───────────────────────────────────────────────────────
const ECF_COLS_DEF = [
  { key: 'numero',     label: 'e-NCF',        defaultVisible: true  },
  { key: 'tipo',       label: 'Tipo',         defaultVisible: true  },
  { key: 'estadoDGII', label: 'Estado DGII',  defaultVisible: true  },
  { key: 'doc',        label: 'Documento',    defaultVisible: true  },
  { key: 'intentosEnvio', label: 'Intentos', defaultVisible: false },
  { key: 'createdAt',  label: 'Fecha',        defaultVisible: true  },
];

function ECFListTab({ onRefresh }: { onRefresh: () => void }) {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('ecf', ECF_COLS_DEF);
  const [estado, setEstado] = useState<string | undefined>();
  const [tipo,   setTipo]   = useState<string | undefined>();
  const [page,   setPage]   = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [xmlModal, setXmlModal] = useState<{ numero: string; xml: string } | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ecf-list', page, estado, tipo],
    queryFn:  () => ecfApi.list(page, 10, estado, tipo),
  });

  const { data: tipos } = useQuery({ queryKey: ['ecf-tipos'], queryFn: ecfApi.tipos });

  const reenviarMut = useMutation({
    mutationFn: ecfApi.reenviar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ecf-list'] }); message.success('Reenvío exitoso'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al reenviar'),
  });

  const handleVerXML = async (numero: string) => {
    try {
      const xml = await ecfApi.getXml(numero);
      setXmlModal({ numero, xml });
    } catch {
      message.error('XML no disponible');
    }
  };

  const cols = [
    { title: 'e-NCF',       dataIndex: 'numero',      width: 165,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Tipo',        key: 'tipo',               width: 70,
      render: (_: any, r: any) => <Tag>{r.tipoECF?.codigo}</Tag> },
    { title: 'Estado DGII', dataIndex: 'estadoDGII',   width: 150,
      render: (v: string) => (
        <Tag color={estadoDGIIColor[v] ?? 'default'} icon={estadoDGIIIcon[v]}>
          {v?.replace(/_/g, ' ').toUpperCase()}
        </Tag>
      )},
    { title: 'Documento',   key: 'doc',                width: 140,
      render: (_: any, r: any) => r.factura?.folio ?? <Text type="secondary">—</Text> },
    { title: 'Intentos',    dataIndex: 'intentosEnvio', width: 80,
      render: (v: number) => <Badge count={v} color={v >= 3 ? 'red' : v > 0 ? 'orange' : 'green'} showZero /> },
    { title: 'Fecha',       dataIndex: 'createdAt',    width: 100, render: (v: string) => fmt.date(v) },
    {
      title: '', key: 'actions', width: 140,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tooltip title="Ver detalle">
            <Button size="small" onClick={() => setDetail(r)}>Ver</Button>
          </Tooltip>
          <Tooltip title="Ver XML / diagnóstico">
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleVerXML(r.numero)} />
          </Tooltip>
          {['pendiente_envio', 'rechazado'].includes(r.estadoDGII) && r.intentosEnvio < 5 && (
            <Tooltip title="Reenviar a tu proveedor e-CF">
              <Button size="small" type="primary" icon={<SendOutlined />}
                loading={reenviarMut.isPending}
                onClick={() => reenviarMut.mutate(r.numero)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Row gutter={[12, 12]} align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Select placeholder="Estado DGII" allowClear style={{ width: 190 }}
              onChange={(v) => { setEstado(v); setPage(1); }}
              options={[
                { value: 'pendiente_envio', label: 'Pendiente envío' },
                { value: 'enviado',         label: 'Enviado (procesando)' },
                { value: 'aceptado',        label: 'Aceptado' },
                { value: 'rechazado',       label: 'Rechazado' },
                { value: 'contingencia',    label: 'Contingencia' },
                { value: 'observado',       label: 'Observado' },
                { value: 'pendiente',       label: 'Pendiente (antiguo)' },
              ].map(({ value, label }) => ({
                value,
                label: <Tag color={estadoDGIIColor[value] ?? 'default'}>{label.toUpperCase()}</Tag>,
              }))} />
            <Select placeholder="Tipo e-CF" allowClear style={{ width: 110 }}
              onChange={(v) => { setTipo(v); setPage(1); }}
              options={tipos?.map((t: any) => ({ value: t.codigo, label: t.codigo }))} />
          </Space>
        </Col>
        <Col>
          <Space size={2}>
            <ColumnToggle columns={ECF_COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['ecf-list']} />
            <VideoTutorialButton />
          </Space>
        </Col>
      </Row>

      <Table columns={filterColumns(cols)} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* Detalle e-CF */}
      <Drawer title={`e-CF: ${detail?.numero}`} open={!!detail} onClose={() => setDetail(null)} width={600}>
        {detail && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Número e-CF">
              <Text code strong>{detail.numero}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tipo">{detail.tipoECF?.codigo} — {detail.tipoECF?.descripcion}</Descriptions.Item>
            <Descriptions.Item label="Estado DGII">
              <Tag color={estadoDGIIColor[detail.estadoDGII] ?? 'default'}>
                {detail.estadoDGII?.replace(/_/g,' ').toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Documento asociado">{detail.factura?.folio ?? 'Sin documento'}</Descriptions.Item>
            <Descriptions.Item label="Código de seguridad"><Text code>{detail.codigoSeguridad}</Text></Descriptions.Item>
            <Descriptions.Item label="Track ID tu proveedor e-CF">
              <Text code style={{ fontSize: 11 }}>{detail.trackId ?? '—'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Intentos de envío">{detail.intentosEnvio}</Descriptions.Item>
            {detail.errorEnvio && (
              <Descriptions.Item label="Último error">
                <Alert type="error" message={detail.errorEnvio} showIcon />
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Creado">{fmt.date(detail.createdAt)}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* XML Modal */}
      <Modal title={`XML — ${xmlModal?.numero}`} open={!!xmlModal} onCancel={() => setXmlModal(null)}
        footer={<Button onClick={() => setXmlModal(null)}>Cerrar</Button>} width={720}>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, overflow: 'auto',
                      maxHeight: 480, fontSize: 11, fontFamily: 'monospace' }}>
          {xmlModal?.xml}
        </pre>
      </Modal>
    </>
  );
}

// ── Tab: Secuencias ───────────────────────────────────────────────────────────
function SecuenciasTab({ onRefresh }: { onRefresh: () => void }) {
  const [openCreate, setOpenCreate]   = useState(false);
  const [editTarget, setEditTarget]   = useState<any>(null);
  const [createForm] = Form.useForm();
  const [editForm]   = Form.useForm();
  const qc = useQueryClient();

  const { data: secuencias, isLoading, isFetching } = useQuery({
    queryKey: ['ecf-secuencias'],
    queryFn:  () => ecfApi.secuencias(),
  });
  const { data: proximas } = useQuery({ queryKey: ['ecf-proximas'], queryFn: ecfApi.secuenciasProximasVencer });
  const { data: tipos }    = useQuery({ queryKey: ['ecf-tipos'],    queryFn: ecfApi.tipos });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['ecf-secuencias'] });
    qc.invalidateQueries({ queryKey: ['ecf-proximas'] });
    onRefresh();
  };

  const createMut = useMutation({
    mutationFn: ecfApi.createSecuencia,
    onSuccess: () => { invalidar(); setOpenCreate(false); createForm.resetFields(); message.success('Secuencia registrada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al registrar'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => ecfApi.updateSecuencia(id, body),
    onSuccess: () => { invalidar(); setEditTarget(null); editForm.resetFields(); message.success('Secuencia actualizada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede modificar'),
  });

  const desactivarMut = useMutation({
    mutationFn: (id: number) => ecfApi.desactivarSecuencia(id),
    onSuccess: () => { invalidar(); message.success('Secuencia inactivada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede inactivar'),
  });

  const handleEdit = (r: any) => {
    setEditTarget(r);
    editForm.setFieldsValue({
      secuenciaInicial:  r.secuenciaInicial,
      secuenciaFinal:    r.secuenciaFinal,
      fechaVencimiento:  r.fechaVencimiento?.toString().slice(0, 10),
    });
  };

  const noUsada = (r: any) => r.secuenciaActual === r.secuenciaInicial;

  const cols = [
    { title: 'Tipo',         key: 'tipo',                    width: 80,
      render: (_: any, r: any) => <Tag color="blue">{r.tipoECF?.codigo}</Tag> },
    { title: 'Descripción',  key: 'desc',                    ellipsis: true,
      render: (_: any, r: any) => <Text style={{ fontSize: 12 }}>{r.tipoECF?.descripcion}</Text> },
    { title: 'Desde',        dataIndex: 'secuenciaInicial',  width: 80 },
    { title: 'Hasta',        dataIndex: 'secuenciaFinal',    width: 80 },
    { title: 'Actual',       dataIndex: 'secuenciaActual',   width: 80 },
    { title: 'Disponibles',  key: 'disp',                    width: 95,
      render: (_: any, r: any) => {
        const disp = r.secuenciaFinal - r.secuenciaActual + 1;
        return <Tag color={disp <= 10 ? 'red' : disp <= 50 ? 'orange' : 'green'}>{disp}</Tag>;
      }},
    { title: '% Uso',        key: 'pct',                     width: 80,
      render: (_: any, r: any) => {
        const pct = r.pctUsado ?? 0;
        return <Text style={{ color: pct >= 90 ? '#ff4d4f' : undefined }}>{pct}%</Text>;
      }},
    { title: 'Vencimiento',  dataIndex: 'fechaVencimiento',  width: 110,
      render: (v: string) => fmt.date(v) },
    { title: 'Estado',       key: 'estado',                  width: 90,
      render: (_: any, r: any) => (
        r.isAgotada
          ? <Tag color="red">Agotada</Tag>
          : r.isActiva
            ? <Tag color="green">Activa</Tag>
            : <Tag color="default">Inactiva</Tag>
      )},
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_: any, r: any) => {
        const puedeInactivar = r.isActiva && !r.isAgotada;
        const puedeEditar    = noUsada(r) && puedeInactivar;
        return (
          <Space size={4}>
            {puedeEditar && (
              <Tooltip title="Editar — sin números emitidos aún">
                <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
              </Tooltip>
            )}
            {puedeInactivar && (
              <Popconfirm
                title="¿Inactivar esta secuencia?"
                description="La secuencia quedará inactiva y no se usará para nuevos e-CFs."
                okText="Inactivar"
                okButtonProps={{ danger: true }}
                cancelText="Cancelar"
                onConfirm={() => desactivarMut.mutate(r.id)}
              >
                <Tooltip title="Inactivar secuencia">
                  <Button size="small" danger icon={<StopOutlined />}
                    loading={desactivarMut.isPending} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <>
      {Array.isArray(proximas) && proximas.length > 0 && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${proximas.length} secuencia(s) próximas a vencer o con stock bajo. Solicita nuevas autorizaciones a la DGII.`} />
      )}

      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col />
        <Col>
          <Space size={2}>
            <Tooltip title="Actualizar secuencias">
              <Button type="text" size="small" icon={<ReloadOutlined spin={isFetching} />}
                onClick={() => { qc.invalidateQueries({ queryKey: ['ecf-secuencias'] }); }} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenCreate(true)}>
              Registrar secuencia DGII
            </Button>
          </Space>
        </Col>
      </Row>

      <Table columns={cols} dataSource={secuencias?.data ?? []} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />

      {/* Modal: registrar nueva secuencia */}
      <Modal title="Registrar nueva secuencia autorizada" open={openCreate}
        onCancel={() => setOpenCreate(false)} footer={null} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={v => createMut.mutate(v)}>
          <Form.Item name="tipoECFId" label="Tipo de e-CF" rules={[{ required: true }]}>
            <Select options={tipos?.map((t: any) => ({ value: t.id, label: `${t.codigo} — ${t.descripcion}` }))} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="secuenciaInicial" label="Secuencia Inicial" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="secuenciaFinal" label="Secuencia Final" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="fechaVencimiento" label="Fecha de Vencimiento" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenCreate(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: editar secuencia sin usar */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <span>Editar secuencia — {editTarget?.tipoECF?.codigo}</span>
            <Tag color="green">Sin números emitidos</Tag>
          </Space>
        }
        open={!!editTarget}
        onCancel={() => { setEditTarget(null); editForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Solo puedes editar esta secuencia porque aún no se ha emitido ningún comprobante con ella."
        />
        <Form form={editForm} layout="vertical"
          onFinish={v => updateMut.mutate({ id: editTarget.id, body: v })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="secuenciaInicial" label="Secuencia Inicial" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="secuenciaFinal" label="Secuencia Final" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="fechaVencimiento" label="Fecha de Vencimiento" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setEditTarget(null); editForm.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={updateMut.isPending}>Guardar cambios</Button></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ── Tab: Resumen ──────────────────────────────────────────────────────────────
function ResumenTab({ onRefresh }: { onRefresh: () => void }) {
  const qc = useQueryClient();
  const { data: pendientes, isFetching: fetchingP } = useQuery({
    queryKey:        ['ecf-pendientes'],
    queryFn:         ecfApi.pendientes,
    refetchInterval: (query) => ((query.state.data as any[])?.length ?? 0) > 0 ? 6_000 : false,
  });
  const { data: rechazados, isFetching: fetchingR } = useQuery({
    queryKey: ['ecf-rechazados'],
    queryFn:  ecfApi.rechazados,
  });

  return (
    <>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Tooltip title="Actualizar resumen">
          <Button type="text" size="small" icon={<ReloadOutlined spin={fetchingP || fetchingR} />}
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['ecf-pendientes'] });
              qc.invalidateQueries({ queryKey: ['ecf-rechazados'] });
              onRefresh();
            }} />
        </Tooltip>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title={<><ClockCircleOutlined /> Pendientes de respuesta DGII ({pendientes?.length ?? 0})</>}
            extra={pendientes?.length > 0 && <Tag color="orange">Requieren atención</Tag>}>
            {pendientes?.length === 0
              ? <Text type="secondary">Sin e-CFs pendientes ✓</Text>
              : <Table dataSource={pendientes ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 5 }}
                  columns={[
                    { title: 'Número', dataIndex: 'numero', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                    { title: 'Tipo', key: 'tipo', render: (_: any, r: any) => <Tag>{r.tipoECF?.codigo}</Tag> },
                    { title: 'Intentos', dataIndex: 'intentosEnvio' },
                  ]} />
            }
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> Rechazados por DGII ({rechazados?.length ?? 0})</>}
            extra={rechazados?.length > 0 && <Tag color="red">Acción requerida</Tag>}>
            {rechazados?.length === 0
              ? <Text type="secondary">Sin e-CFs rechazados ✓</Text>
              : <Table dataSource={rechazados ?? []} rowKey="id" size="small"
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 5 }}
                  columns={[
                    { title: 'Número', dataIndex: 'numero', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                    { title: 'Error', dataIndex: 'errorEnvio', ellipsis: true },
                  ]} />
            }
          </Card>
        </Col>
      </Row>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ECFPage() {
  const { token } = theme.useToken();
  const { data: proximas } = useQuery({ queryKey: ['ecf-proximas'], queryFn: ecfApi.secuenciasProximasVencer });
  const { bloqueado, config, plan } = usePlanGuard();
  const qc = useQueryClient();

  if (bloqueado && config) return <ModuloBloqueado modulo="e-CF DGII" planMinimo={config.planMinimo} planActual={plan} />;

  const handleGlobalRefresh = () => {
    qc.invalidateQueries({ queryKey: ['ecf-list'] });
    qc.invalidateQueries({ queryKey: ['ecf-pendientes'] });
    qc.invalidateQueries({ queryKey: ['ecf-rechazados'] });
    qc.invalidateQueries({ queryKey: ['ecf-secuencias'] });
    qc.invalidateQueries({ queryKey: ['ecf-proximas'] });
    message.success('Módulo e-CF actualizado');
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            e-CF — Comprobantes Fiscales Electrónicos DGII
          </Title>
        </Col>
      </Row>

      {Array.isArray(proximas) && proximas.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="Secuencias próximas a vencer"
          description={`${proximas.length} secuencia(s) con menos de 30 días o menos del 15% disponible. Solicita nueva autorización a la DGII antes de que se interrumpa la facturación electrónica.`} />
      )}

      <Card>
        <Tabs defaultActiveKey="resumen" items={[
          { key: 'resumen',    label: '📊 Resumen',         children: <ResumenTab    onRefresh={handleGlobalRefresh} /> },
          { key: 'lista',      label: '📄 e-CFs emitidos',  children: <ECFListTab   onRefresh={handleGlobalRefresh} /> },
          { key: 'secuencias', label: '🔢 Secuencias DGII', children: <SecuenciasTab onRefresh={handleGlobalRefresh} /> },
        ]} />
      </Card>
    </div>
  );
}
