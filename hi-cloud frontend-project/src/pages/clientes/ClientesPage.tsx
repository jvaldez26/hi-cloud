import { useState, useCallback, useEffect } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { useRncLookup } from '../../hooks/useRncLookup';
import RncBadge from '../../components/ui/RncBadge';
import { useNavigate } from 'react-router-dom';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Input, Space, Tag, Modal, Form, Row, Col,
  Typography, Popconfirm, message, Card, Select, InputNumber,
  Avatar, Tooltip, theme,
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
import { clientesApi, type ClientePayload, type ClientesConMismoRnc } from '../../api/clientes.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Cliente } from '../../types';
import { fmt } from '../../utils/formatters';
import { useCanDo } from '../../hooks/useCanDo';

const { Title, Text } = Typography;
const { Option } = Select;

const SECTORES = ['Comercio', 'Servicios', 'Manufactura', 'Construcción', 'Salud', 'Educación', 'Tecnología', 'Agropecuario', 'Otro'];

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
  const [form]                          = Form.useForm<ClientePayload>();
  // Clientes que ya usan el RNC tecleado. No bloquea: varias escuelas de un
  // mismo distrito educativo facturan bajo el RNC del distrito y son clientes
  // distintos. Solo se muestran para que el usuario elija uno si ya existe.
  const [rncExistentes, setRncExistentes] = useState<ClientesConMismoRnc | null>(null);
  const qc = useQueryClient();
  const rnc = useRncLookup();

  // Autocompletar desde DGII cuando se encuentra el RNC. El nombre oficial va a
  // `razonSocial` (lo que se declara ante DGII) y también a `nombre` si está
  // vacío — este último el usuario puede reescribirlo para distinguir sucursales.
  useEffect(() => {
    if (rnc.datos?.encontrado && rnc.datos?.nombre) {
      const parche: Partial<ClientePayload> = {};
      if (!form.getFieldValue('nombre'))      parche.nombre      = rnc.datos.nombre;
      if (!form.getFieldValue('razonSocial')) parche.razonSocial = rnc.datos.nombre;
      if (Object.keys(parche).length) form.setFieldsValue(parche);
    }
  }, [rnc.datos, form]);

  /** Consulta quién más usa este RNC. Se dispara al terminar de teclearlo. */
  const consultarRncExistentes = useCallback(async (valor: string) => {
    const limpio = (valor ?? '').replace(/\D/g, '');
    if (limpio.length !== 9 && limpio.length !== 11) { setRncExistentes(null); return; }
    try {
      const res = await clientesApi.buscarPorRnc(limpio, editing?.id);
      setRncExistentes(res.total > 0 ? res : null);
    } catch { setRncExistentes(null); }
  }, [editing?.id]);

  /**
   * Descarta el cliente nuevo y abre el existente que el usuario eligió — el
   * caso legítimo se resuelve en dos clics y el duplicado por error se evita.
   */
  const usarClienteExistente = async (id: number) => {
    // El listado de la alerta trae solo lo necesario para distinguir; para
    // editar hace falta el cliente completo (crédito, sector, etc.)
    const completo = await clientesApi.getOne(id).catch(() => null);
    if (!completo) { message.error('No se pudo abrir el cliente'); return; }
    setRncExistentes(null);
    setEditing(completo);
    form.setFieldsValue({ ...completo, diasCredito: (completo as any).diasCredito ?? 30 });
    setOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', page, search],
    queryFn:  () => clientesApi.list(page, 15, search),
  });

  const createMut = useMutation({
    mutationFn: clientesApi.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['clientes'] }); closeModal(); message.success('Cliente creado'); },
    onError:    (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al crear'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ClientePayload> }) => clientesApi.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); closeModal(); message.success('Cliente actualizado'); },
    onError:   (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error'),
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

  const openCreate = () => { setEditing(null); form.resetFields(); setRncExistentes(null); setOpen(true); };
  const openEdit   = (c: Cliente) => {
    setEditing(c); setRncExistentes(null);
    form.setFieldsValue({ ...c, diasCredito: (c as any).diasCredito ?? 30 });
    setOpen(true);
    if (c.rfc) void consultarRncExistentes(c.rfc);
  };
  const closeModal = () => {
    setOpen(false); setEditing(null); form.resetFields();
    setRncExistentes(null); rnc.limpiar();
  };
  const handleSubmit = (values: ClientePayload) => {
    if (editing) updateMut.mutate({ id: editing.id, body: values });
    else         createMut.mutate(values);
  };

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
      ) : (
        <Table
          columns={filterColumns(columns)} dataSource={data?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            total: data?.meta.total, pageSize: 15, current: page,
            onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} clientes`,
            showSizeChanger: false, size: 'small',
          }}
        />
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

      {/* Modal crear/editar */}
      <Modal
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
        open={open} onCancel={closeModal} footer={null}
        width="min(680px, 95vw)" destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.identificadorExtranjero !== c.identificadorExtranjero}>
                {({ getFieldValue }) => {
                  const tieneIdExt = !!getFieldValue('identificadorExtranjero');
                  return (
                    <>
                      <Form.Item name="rfc" label="RNC / Cédula"
                        rules={[
                          { required: !tieneIdExt, message: 'El RNC o Cédula es requerido (o ingrese Identificador Extranjero)' },
                          {
                            validator: (_, v) => {
                              if (!v) return Promise.resolve();
                              return /^\d{9}$|^\d{11}$/.test(v)
                                ? Promise.resolve()
                                : Promise.reject('RNC debe tener 9 dígitos o Cédula debe tener 11 dígitos');
                            },
                          },
                        ]}>
                        <Input
                          placeholder={tieneIdExt ? '(opcional para clientes extranjeros)' : '9 dígitos (RNC) u 11 dígitos (Cédula)'}
                          maxLength={11}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '');
                            rnc.consultarDebounced(v);
                            void consultarRncExistentes(v);
                          }}
                        />
                      </Form.Item>
                      <RncBadge datos={rnc.datos} loading={rnc.loading} />
                    </>
                  );
                }}
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item
                name="nombre"
                label="Nombre del cliente"
                tooltip="Uso interno. Si varias sucursales comparten RNC (p. ej. escuelas de un mismo distrito educativo), este es el nombre que las distingue en el listado, el POS y su cuenta por cobrar."
                rules={[{ required: true }]}>
                <Input placeholder="Ej: Escuela Básica Los Alcarrizos #3" />
              </Form.Item>
            </Col>

            {/* Alerta NO bloqueante: el RNC repetido es válido, solo hay que
                asegurarse de que no sea el mismo cliente registrado dos veces */}
            {rncExistentes && rncExistentes.total > 0 && (
              <Col xs={24}>
                <div style={{
                  border: `1px solid ${token.colorWarningBorder}`,
                  background: token.colorWarningBg,
                  borderRadius: 8, padding: '10px 12px', marginBottom: 16,
                }}>
                  <Text strong style={{ fontSize: 13 }}>
                    Ya existe{rncExistentes.total === 1 ? '' : 'n'} {rncExistentes.total}{' '}
                    cliente{rncExistentes.total === 1 ? '' : 's'} con este RNC
                  </Text>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2, marginBottom: 8 }}>
                    Compartir RNC es válido cuando son cuentas distintas del mismo
                    contribuyente. Si alguno de estos ya es el cliente que ibas a
                    registrar, ábrelo en vez de crear otro.
                  </div>
                  {rncExistentes.clientes.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '6px 0',
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                          {[c.direccion, c.ciudad].filter(Boolean).join(', ') || 'Sin dirección registrada'}
                          {c.telefono ? ` · ${c.telefono}` : ''}
                        </div>
                      </div>
                      <Button size="small" onClick={() => void usarClienteExistente(c.id)}>
                        Usar este
                      </Button>
                    </div>
                  ))}
                </div>
              </Col>
            )}
            <Col xs={24} sm={12}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.identificadorExtranjero !== c.identificadorExtranjero}>
                {({ getFieldValue }) => {
                  const tieneIdExt = !!getFieldValue('identificadorExtranjero');
                  return (
                    <Form.Item name="rncReceptor" label="RNC Receptor (e-CF)"
                      rules={[{
                        validator: (_, v) => {
                          if (!v || tieneIdExt) return Promise.resolve();
                          return /^\d{9}$|^\d{11}$/.test(v)
                            ? Promise.resolve()
                            : Promise.reject('9 u 11 dígitos');
                        },
                      }]}>
                      <Input
                        placeholder={tieneIdExt ? '(opcional para clientes extranjeros)' : '9 u 11 dígitos'}
                        maxLength={11}
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="identificadorExtranjero"
                label="Identificador Extranjero (E46)"
                tooltip="ID fiscal del cliente en su país — obligatorio para emitir e-CF E46 (Exportaciones)">
                <Input placeholder="EIN, NIT, RFC, VAT…" maxLength={30} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="regimenFiscal" label="Régimen Fiscal">
                <Select allowClear>
                  <Option value="ORDINARIO">Ordinario</Option>
                  <Option value="PST">PST — Pequeño contribuyente</Option>
                  <Option value="RST">RST — Simplificado</Option>
                  <Option value="EXENTO">Exento</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input placeholder="(809) 000-0000" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item name="direccion" label="Dirección">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="ciudad" label="Ciudad">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="estado" label="Provincia">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={6}>
              <Form.Item name="codigoPostal" label="Cód. Postal">
                <Input maxLength={10} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item
                name="razonSocial"
                label="Razón Social fiscal (DGII)"
                tooltip="La razón social registrada para este RNC. Es lo que se declara como RazonSocialComprador en el e-CF, así que debe ser idéntica en todos los clientes que compartan el RNC. Si se deja vacía se usa el nombre del cliente.">
                <Input placeholder="Se autocompleta al consultar el RNC" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="sector" label="Sector Económico">
                <Select allowClear>
                  {SECTORES.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="diasCredito" label="Días de crédito">
                <InputNumber style={{ width: '100%' }} min={0} max={365} addonAfter="días" placeholder="30" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="limiteCredito" label="Límite de crédito (DOP)">
                <InputNumber style={{ width: '100%' }} min={0} step={5000}
                  formatter={(v: any) => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                  parser={(v: any) => v?.replace(/,/g, '') ?? ''}
                  placeholder="0 = sin límite" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notas" label="Notas internas">
                <Input.TextArea rows={2} placeholder="Observaciones, condiciones especiales..." />
              </Form.Item>
            </Col>
          </Row>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Actualizar' : 'Crear cliente'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
