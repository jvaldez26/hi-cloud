import { useState, useCallback } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Input, Space, Tag, Modal, Row, Col,
  Typography, Popconfirm, message, Card, Avatar, Tooltip, theme,
} from 'antd';
import { TableActions } from '../../components/ui/TableActions';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  FileExcelOutlined, PhoneOutlined, MailOutlined, EyeOutlined,
  GlobalOutlined, CopyOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { clientesApi } from '../../api/clientes.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Cliente } from '../../types';
import { fmt } from '../../utils/formatters';
import { useCanDo } from '../../hooks/useCanDo';
import { SkeletonTabla } from '../../components/ui/SkeletonTabla';
import { useSkeletonDelay } from '../../hooks/useSkeletonDelay';
import ClienteFormModal from '../../components/clientes/ClienteFormModal';

const { Title, Text } = Typography;

export default function ClientesPage() {
  const navigate    = useNavigate();
  const { token }   = theme.useToken();
  const isMobile    = useMobile();

  const puedeCrear        = useCanDo('clientes:crear');
  const puedeEliminar     = useCanDo('clientes:eliminar');
  const puedeEstadoCuenta = useCanDo('clientes:estado_cuenta');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [open,         setOpen]         = useState(false);
  const [editing,      setEditing]      = useState<Cliente | null>(null);
  const [emailCliente, setEmailCliente] = useState<Cliente | null>(null);
  const [emailDestino, setEmailDestino] = useState('');
  const [portalCliente, setPortalCliente] = useState<Cliente | null>(null);
  const [portalUrl,     setPortalUrl]     = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', page, search],
    queryFn:  () => clientesApi.list(page, 15, search),
  });
  const showSkeleton = useSkeletonDelay(isLoading, 200);

  // Para impedir que se cargue el RNC propio como RNC del comprador
  const { data: empresa } = useQuery<{ rnc?: string; nombre?: string } | null>({
    queryKey: ['empresa'],
    queryFn:  () => api.get('/configuracion/empresa').then(r => r.data?.data ?? r.data).catch(() => null),
    staleTime: 10 * 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: clientesApi.remove,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['clientes'] }); message.success('Cliente eliminado'); },
    onError:    (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar'),
  });

  const estadoCuentaMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/cliente/${id}/estado-cuenta`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, vars) => {
      setEmailCliente(null); setEmailDestino('');
      message.success(`Estado de cuenta enviado a ${vars.email}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al enviar'),
  });

  const portalMut = useMutation({
    mutationFn: (clienteId: number) =>
      api.post(`/portal/cliente/${clienteId}/activar`).then(r => r.data?.data ?? r.data),
    onSuccess: (data) => {
      setPortalUrl(data.portalUrl ?? '');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al generar enlace del portal'),
  });

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit   = (c: Cliente) => { setEditing(c); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); };

  const handleExcel = useCallback(async () => {
    const all = await clientesApi.list(1, 5000, search);
    const filas = (all?.data ?? []).map((c: Cliente) => ({
      'Nombre':     c.nombre,
      'RNC/Cédula': c.rfc ?? '',
      'Email':      c.email ?? '',
      'Teléfono':   c.telefono ?? '',
      'Ciudad':     c.ciudad ?? '',
      'Dirección':  c.direccion ?? '',
      'Estado':     c.isActive ? 'Activo' : 'Inactivo',
      'Registro':   c.createdAt ? dayjs(c.createdAt).format('DD/MM/YYYY') : '',
    }));
    exportarExcel(filas, `Clientes-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} clientes exportados`);
  }, [search]);

  const COLS_DEF = [
    { key: 'nombre',   label: 'Cliente',  defaultVisible: true  },
    { key: 'contacto', label: 'Contacto', defaultVisible: true  },
    { key: 'ciudad',   label: 'Ciudad',   defaultVisible: false },
    { key: 'isActive', label: 'Estado',   defaultVisible: true  },
    { key: 'createdAt',label: 'Registro', defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('clientes', COLS_DEF);

  const columns = [
    {
      title: 'Cliente', key: 'nombre', ellipsis: true,
      render: (_: unknown, r: Cliente) => (
        <Space>
          <Avatar size={30} style={{ background: token.colorPrimary, flexShrink: 0, fontSize: 12 }}>
            {r.nombre.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.nombre}</Text>
            {r.rfc && (
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>{r.rfc}</Text>
                {/* Compartir RNC es válido, pero hay que poder distinguirlos */}
                {r.rncCompartido && (
                  <Tooltip title="Otro cliente activo usa este mismo RNC">
                    <Tag color="blue" style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px', padding: '0 5px' }}>
                      RNC compartido
                    </Tag>
                  </Tooltip>
                )}
              </div>
            )}
            {r.rncCompartido && (r.direccion || r.ciudad) && (
              <div><Text type="secondary" style={{ fontSize: 11 }}>
                {[r.direccion, r.ciudad].filter(Boolean).join(', ')}
              </Text></div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: 'Contacto', key: 'contacto', width: 200,
      render: (_: unknown, r: Cliente) => (
        <Space direction="vertical" size={0}>
          {r.email && (
            <Tooltip title={r.email}>
              <Text style={{ fontSize: 12 }}><MailOutlined style={{ marginRight: 4, color: token.colorTextQuaternary }} />{r.email}</Text>
            </Tooltip>
          )}
          {r.telefono && (
            <Text style={{ fontSize: 12 }}><PhoneOutlined style={{ marginRight: 4, color: token.colorTextQuaternary }} />{r.telefono}</Text>
          )}
        </Space>
      ),
    },
    { title: 'Ciudad', dataIndex: 'ciudad', width: 110, render: (v: string) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: 'Registro', dataIndex: 'createdAt', width: 100,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.date(v)}</Text>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'right' as const, isActions: true,
      render: (_: unknown, r: Cliente) => (
        <TableActions
          onView={() => navigate(`/clientes/${r.id}/estado-cuenta`)}
          viewLabel="Ver estado de cuenta"
          items={[
            { key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEdit(r) },
            ...(puedeEstadoCuenta ? [{ key: 'estado', label: 'Estado de cuenta', icon: <EyeOutlined />, onClick: () => navigate(`/clientes/${r.id}/estado-cuenta`) }] : []),
            ...(puedeEstadoCuenta && r.email ? [{
              key: 'email-estado',
              label: 'Enviar estado de cuenta',
              icon: <MailOutlined />,
              onClick: () => { setEmailCliente(r); setEmailDestino(r.email ?? ''); },
            }] : []),
            {
              key: 'portal',
              label: 'Portal del cliente',
              icon: <GlobalOutlined />,
              onClick: () => { setPortalCliente(r); setPortalUrl(''); portalMut.mutate(r.id); },
            },
            ...(puedeEliminar ? [
              { type: 'divider' as const },
              { key: 'eliminar', label: 'Eliminar', danger: true, icon: <DeleteOutlined />, onClick: () => deleteMut.mutate(r.id) },
            ] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Clientes</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} clientes
            </Text>
          )}
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por nombre o RNC/Cédula..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: '100%', maxWidth: 260, minWidth: 0 }}
            />
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['clientes']} />
            <VideoTutorialButton />
            {puedeCrear && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo cliente</Button>
            )}
          </Space>
        </Col>
      </Row>

      {isMobile ? (
        showSkeleton ? <SkeletonTabla rows={5} cols={3} /> : (
        <div>
          {(data?.data ?? []).map((c: Cliente) => (
            <div
              key={c.id}
              style={{
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: 10, padding: '12px 14px', marginBottom: 10,
                background: token.colorBgContainer,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <Avatar
                size={42}
                style={{ background: token.colorPrimary, flexShrink: 0, fontWeight: 600 }}
              >
                {c.nombre.charAt(0).toUpperCase()}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 14 }}>{c.nombre}</Text>
                {c.rfc && <div><Text style={{ fontSize: 11, color: token.colorTextSecondary }}>{c.rfc}</Text></div>}
                {c.telefono && (
                  <div><Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                    <PhoneOutlined style={{ marginRight: 4 }} />{c.telefono}
                  </Text></div>
                )}
              </div>
              <Space size={4}>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/clientes/${c.id}/estado-cuenta`)}
                />
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(c)}
                />
              </Space>
            </div>
          ))}
          {data?.meta && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Space>
                <Button size="small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</Button>
                <Text style={{ fontSize: 12 }}>{page} / {Math.ceil((data.meta.total ?? 0) / 15)}</Text>
                <Button size="small" disabled={page * 15 >= (data.meta.total ?? 0)} onClick={() => setPage(p => p + 1)}>Siguiente ›</Button>
              </Space>
            </div>
          )}
        </div>
        )
      ) : (
        showSkeleton ? <SkeletonTabla rows={6} cols={6} /> : (
        <Table
          columns={filterColumns(columns)} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            total: data?.meta.total, pageSize: 10, current: page,
            onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} clientes`,
            showSizeChanger: false, size: 'small',
          }}
        />
        )
      )}

      {/* Modal: Portal del cliente */}
      <Modal
        title={<><GlobalOutlined style={{ color: '#1677ff', marginRight: 8 }} />Portal del cliente</>}
        open={!!portalCliente}
        onCancel={() => { setPortalCliente(null); setPortalUrl(''); }}
        footer={[
          <Button key="close" onClick={() => { setPortalCliente(null); setPortalUrl(''); }}>Cerrar</Button>,
          portalUrl && (
            <Button key="copy" type="primary" icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                message.success('Enlace copiado al portapapeles');
              }}>
              Copiar enlace
            </Button>
          ),
        ]}
        destroyOnHidden
        width={480}
      >
        {portalCliente && (
          <div>
            <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 13 }}>
              Cliente: <strong>{portalCliente.nombre}</strong>
            </p>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 12 }}>
              Comparte este enlace con tu cliente para que vea sus facturas, estado de cuenta y pueda crear tickets de soporte.
              El enlace es válido por <strong>30 días</strong>.
            </p>
            {portalMut.isPending ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <span>Generando enlace...</span>
              </div>
            ) : portalUrl ? (
              <div style={{
                padding: '10px 14px',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <LinkOutlined style={{ color: '#0369a1', flexShrink: 0 }} />
                <Text
                  style={{ fontSize: 12, wordBreak: 'break-all', flex: 1, color: '#0369a1' }}
                  copyable={{ tooltips: ['Copiar', 'Copiado'] }}
                >
                  {portalUrl}
                </Text>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* Modal: Estado de cuenta por email */}
      <Modal
        title={<><MailOutlined style={{ color: '#1677ff', marginRight: 8 }} />Enviar estado de cuenta</>}
        open={!!emailCliente}
        onCancel={() => { setEmailCliente(null); setEmailDestino(''); }}
        onOk={() => emailCliente && estadoCuentaMut.mutate({ id: emailCliente.id, email: emailDestino })}
        confirmLoading={estadoCuentaMut.isPending}
        okText="Enviar"
        okButtonProps={{ disabled: !emailDestino }}
        destroyOnHidden
        width={420}
      >
        {emailCliente && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
              Cliente: <strong>{emailCliente.nombre}</strong>
            </p>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 12 }}>
              Se enviará un resumen de todas las facturas pendientes de pago.
            </p>
            <Input
              prefix={<MailOutlined />}
              placeholder="correo@cliente.com"
              value={emailDestino}
              onChange={e => setEmailDestino(e.target.value)}
              size="large"
              type="email"
            />
          </div>
        )}
      </Modal>

      <ClienteFormModal
        open={open}
        editing={editing}
        onClose={closeModal}
        empresaRnc={empresa?.rnc}
      />
    </Card>
  );
}
