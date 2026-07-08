import { useState, useEffect, useCallback } from 'react';
import {
  Form, Input, Button, Card, Row, Col, Typography, message, Tag, Table,
  Select, InputNumber, Switch, Divider, Avatar, Modal, Space, Badge,
  Progress, Skeleton, Alert, Popconfirm, Upload, Tooltip, theme,
} from 'antd';
import {
  SaveOutlined, UserAddOutlined, DeleteOutlined, ReloadOutlined,
  MailOutlined, UploadOutlined, CheckCircleOutlined, WarningOutlined,
  InfoCircleOutlined, LockOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  BellOutlined, BankOutlined,
} from '@ant-design/icons';
import api from '../../api/client';
import {
  Building2, MapPin, Palette, FileText, Monitor, ReceiptText,
  Users, ShieldCheck, Bell, Lock, PieChart, Activity,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UploadFile } from 'antd';
import { configuracionApi } from '../../api/configuracion.api';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;
const { Option } = Select;

// ── Constantes ────────────────────────────────────────────────────────────────

const PROVINCIAS_RD = [
  'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional', 'Duarte',
  'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
  'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
  'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
  'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
  'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
  'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
];

const ROL_INFO: Record<string, { label: string; color: string; permisos: string[] }> = {
  admin:    {
    label: 'Administrador',
    color: '#1677ff',
    permisos: ['Acceso total', 'Gestión de usuarios', 'Configuración', 'Reportes', 'Facturación', 'Compras', 'RRHH'],
  },
  contador: {
    label: 'Contador',
    color: '#7c3aed',
    permisos: ['Contabilidad', 'Reportes financieros', 'Facturas', 'Compras', 'CxC', 'CxP', 'Declaraciones DGII'],
  },
  vendedor: {
    label: 'Vendedor',
    color: '#10b981',
    permisos: ['Facturas', 'POS', 'Cotizaciones', 'Clientes', 'Pre-facturas', 'Devoluciones'],
  },
  viewer:   {
    label: 'Solo lectura',
    color: '#64748b',
    permisos: ['Ver facturas', 'Ver clientes', 'Ver productos', 'Ver reportes básicos'],
  },
};

type SectionKey =
  | 'datos' | 'ubicacion' | 'branding'
  | 'facturacion' | 'pos' | 'ecf'
  | 'usuarios' | 'roles'
  | 'notificaciones' | 'seguridad' | 'plan' | 'auditoria';

const SIDEBAR_GROUPS: Array<{
  label: string;
  items: Array<{ key: SectionKey; label: string; Icon: React.FC<any>; readonly?: boolean }>;
}> = [
  {
    label: 'Mi Empresa',
    items: [
      { key: 'datos',    label: 'Datos generales',    Icon: Building2 },
      { key: 'ubicacion',label: 'Ubicación y contacto',Icon: MapPin },
      { key: 'branding', label: 'Branding',            Icon: Palette },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { key: 'facturacion', label: 'Facturación',   Icon: FileText },
      { key: 'pos',         label: 'Punto de Venta', Icon: Monitor },
      { key: 'ecf',         label: 'e-CF — Estado',  Icon: ReceiptText, readonly: true },
    ],
  },
  {
    label: 'Mi Equipo',
    items: [
      { key: 'usuarios', label: 'Usuarios',         Icon: Users },
      { key: 'roles',    label: 'Roles y permisos', Icon: ShieldCheck, readonly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'notificaciones', label: 'Notificaciones', Icon: Bell },
      { key: 'seguridad',      label: 'Seguridad',      Icon: Lock },
      { key: 'plan',           label: 'Plan y uso',     Icon: PieChart, readonly: true },
      { key: 'auditoria',      label: 'Auditoría',      Icon: Activity, readonly: true },
    ],
  },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

function ConfigSidebar({
  active, onSelect, collapsed, onToggle,
}: {
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{
      width: collapsed ? 56 : 240,
      minWidth: collapsed ? 56 : 240,
      borderRight: `1px solid ${token.colorBorderSecondary}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width .2s, min-width .2s',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 8px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
        <Button
          type="text" size="small"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {SIDEBAR_GROUPS.map(group => (
          <div key={group.label}>
            {!collapsed && (
              <div style={{
                padding: '8px 16px 4px',
                fontSize: 11,
                fontWeight: 600,
                color: token.colorTextQuaternary,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const isActive = active === item.key;
              return (
                <Tooltip key={item.key} title={collapsed ? item.label : ''} placement="right">
                  <div
                    onClick={() => onSelect(item.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: collapsed ? '9px 0' : '9px 16px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      cursor: 'pointer',
                      borderRadius: 8,
                      margin: '1px 6px',
                      background: isActive ? `${token.colorPrimary}15` : 'transparent',
                      color: isActive ? token.colorPrimary : token.colorText,
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 13,
                      transition: 'background .15s, color .15s',
                    }}
                  >
                    <item.Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                    {!collapsed && (
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}
                    {!collapsed && item.readonly && (
                      <Tag bordered={false} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                        Ver
                      </Tag>
                    )}
                  </div>
                </Tooltip>
              );
            })}
            {!collapsed && <div style={{ margin: '4px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sección: Datos Generales ──────────────────────────────────────────────────

function SeccionDatos({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const { token } = theme.useToken();
  const [form]            = Form.useForm();
  const qc                = useQueryClient();
  const [pendingValues,   setPendingValues]   = useState<any>(null);
  const [rncModalVisible, setRncModalVisible] = useState(false);
  const [rncInfo,         setRncInfo]         = useState<{ tieneEcfConfig?: boolean } | null>(null);
  const [checkingRnc,     setCheckingRnc]     = useState(false);

  useEffect(() => {
    if (empresa) form.setFieldsValue({
      rnc:               empresa.rnc,
      nombre:            empresa.nombre,
      nombreComercial:   empresa.nombreComercial,
      tipoSociedad:      empresa.tipoSociedad,
      sector:            empresa.sector,
      regimenFiscal:     empresa.regimenFiscal,
      actividadEconomica:empresa.actividadEconomica,
      fechaConstitucion: empresa.fechaConstitucion?.split('T')[0] ?? empresa.fechaConstitucion,
      representanteLegal:   empresa.representanteLegal,
      cedulaRepresentante:  empresa.cedulaRepresentante,
    });
  }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      message.success('Datos generales guardados correctamente');
      onSaved();
    },
    onError: (e: any) => {
      const errores = e?.response?.data?.errors;
      const msg     = e?.response?.data?.message;
      if (Array.isArray(errores) && errores.length > 0) {
        message.error(`Error de validación: ${errores.join('. ')}`, 6);
      } else {
        message.error(msg ?? 'Error al guardar. Revisa los campos e intenta de nuevo.', 5);
      }
    },
  });

  const handleSubmit = async (values: any) => {
    const rncCambiado = empresa?.rnc && values.rnc && values.rnc !== empresa.rnc;

    if (rncCambiado) {
      // 1. Verificar unicidad y advertencias e-CF antes de mostrar modal
      setCheckingRnc(true);
      try {
        const info = await configuracionApi.verificarRNC(values.rnc);
        if (!info.disponible) {
          form.setFields([{
            name: 'rnc',
            errors: [`Este RNC ya está registrado para la empresa "${info.empresa?.nombre}"`],
          }]);
          setCheckingRnc(false);
          return;
        }
        setRncInfo(info);
        setPendingValues(values);
        setRncModalVisible(true);
      } catch {
        message.error('No se pudo verificar el RNC. Intenta de nuevo.');
      } finally {
        setCheckingRnc(false);
      }
      return;
    }

    mut.mutate(values);
  };

  const confirmarCambioRnc = () => {
    setRncModalVisible(false);
    if (pendingValues) mut.mutate(pendingValues);
    setPendingValues(null);
    setRncInfo(null);
  };

  const rncAnterior = empresa?.rnc;

  return (
    <>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Divider orientation="left" orientationMargin={0}>Identificación fiscal DGII</Divider>
        <Row gutter={16}>
          <Col xs={24} sm={8} md={5}>
            <Form.Item
              name="rnc"
              label="RNC *"
              validateTrigger={['onBlur', 'onChange']}
              rules={[
                { required: true, message: 'El RNC es obligatorio' },
                {
                  pattern: /^\d{9}$|^\d{11}$/,
                  message: 'El RNC debe tener exactamente 9 u 11 dígitos numéricos',
                },
              ]}
            >
              <Input
                placeholder="101234567"
                maxLength={11}
                style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16} md={11}>
            <Form.Item name="nombre" label="Razón Social *" rules={[{ required: true, message: 'La razón social es obligatoria' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="nombreComercial" label="Nombre Comercial">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item name="tipoSociedad" label="Tipo de Sociedad">
              <Select allowClear>
                <Option value="SRL">S.R.L. — Sociedad de Responsabilidad Limitada</Option>
                <Option value="SA">S.A. — Sociedad Anónima</Option>
                <Option value="EIRL">E.I.R.L. — Empresa Individual de R.L.</Option>
                <Option value="PERSONA_FISICA">Persona Física / Natural</Option>
                <Option value="ONG">ONG / Asociación sin fines de lucro</Option>
                <Option value="OTRO">Otro</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item name="sector" label="Sector Económico">
              <Select allowClear>
                {['COMERCIO','SERVICIOS','MANUFACTURA','CONSTRUCCION','SALUD','EDUCACION','TECNOLOGIA','AGROPECUARIO','OTRO']
                  .map(s => <Option key={s} value={s}>{s.charAt(0)+s.slice(1).toLowerCase()}</Option>)}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item name="regimenFiscal" label="Régimen Fiscal DGII">
              <Select allowClear>
                <Option value="ORDINARIO">Ordinario — Declaración completa</Option>
                <Option value="PST">PST — Pequeño contribuyente</Option>
                <Option value="RST">RST — Régimen Simplificado de Tributos</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={10}>
            <Form.Item name="actividadEconomica" label="Actividad Económica CIIU">
              <Input placeholder="Ej: Comercio al por menor" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="fechaConstitucion" label="Fecha de Constitución">
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" orientationMargin={0}>Representación Legal</Divider>
        <Row gutter={16}>
          <Col xs={24} sm={14}>
            <Form.Item name="representanteLegal" label="Representante Legal">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="cedulaRepresentante"
              label="Cédula del Representante"
              validateTrigger={['onBlur', 'onChange']}
              rules={[{
                pattern: /^\d{11}$/,
                message: 'La cédula debe tener exactamente 11 dígitos numéricos',
              }]}
            >
              <Input
                placeholder="00112345678"
                maxLength={11}
                style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Button
          type="primary"
          htmlType="submit"
          icon={<SaveOutlined />}
          loading={mut.isPending || checkingRnc}
        >
          Guardar datos generales
        </Button>
      </Form>

      {/* Modal de confirmación para cambio de RNC */}
      <Modal
        title={<span style={{ color: '#d97706' }}>⚠️ Confirmar cambio de RNC</span>}
        open={rncModalVisible}
        onOk={confirmarCambioRnc}
        onCancel={() => { setRncModalVisible(false); setPendingValues(null); setRncInfo(null); }}
        okText="Sí, cambiar RNC"
        okButtonProps={{ danger: true }}
        cancelText="Cancelar"
        width={520}
      >
        <div style={{ lineHeight: 1.7 }}>
          <p>Estás cambiando el RNC de la empresa:</p>
          <div style={{ background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`, borderRadius: 8, padding: '10px 14px', margin: '12px 0', fontFamily: 'monospace', fontSize: 14 }}>
            <div><span style={{ color: '#6b7280' }}>Anterior: </span><strong style={{ color: '#dc2626' }}>{rncAnterior}</strong></div>
            <div><span style={{ color: '#6b7280' }}>Nuevo:    </span><strong style={{ color: '#059669' }}>{pendingValues?.rnc}</strong></div>
          </div>
          <p style={{ marginBottom: 8 }}>Este cambio afectará:</p>
          <ul style={{ paddingLeft: 20, margin: '4px 0 12px' }}>
            <li>Los documentos fiscales generados de ahora en adelante</li>
            <li>La configuración fiscal de la empresa ante la DGII</li>
            <li>El RNC que aparece en facturas e-CF</li>
          </ul>
          {rncInfo?.tieneEcfConfig && (
            <div style={{ background: token.colorErrorBg, border: `1px solid ${token.colorErrorBorder}`, borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
              <strong style={{ color: '#dc2626' }}>🔴 Advertencia e-CF:</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7f1d1d' }}>
                Esta empresa tiene configuración e-CF activa en tu proveedor e-CF. Después de cambiar el RNC,
                deberás actualizar manualmente las credenciales en tu proveedor e-CF para que coincida con el nuevo RNC.
                Los comprobantes electrónicos serán rechazados hasta que se actualice.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

// ── Sección: Ubicación y Contacto ─────────────────────────────────────────────

function SeccionUbicacion({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();

  useEffect(() => { if (empresa) form.setFieldsValue(empresa); }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('Ubicación guardada'); onSaved(); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al guardar'),
  });

  return (
    <Form form={form} layout="vertical" onFinish={v => mut.mutate(v)}>
      <Row gutter={16}>
        <Col xs={24} md={16}>
          <Form.Item name="direccion" label="Dirección Línea 1 *" rules={[{ required: true }]}>
            <Input placeholder="Calle, Número, Edificio" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="direccion2" label="Dirección Línea 2">
            <Input placeholder="Suite, Piso, Oficina" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="ciudad" label="Ciudad / Municipio">
            <Input placeholder="Santo Domingo" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="provincia" label="Provincia">
            <Select showSearch allowClear placeholder="Selecciona">
              {PROVINCIAS_RD.map(p => <Option key={p} value={p}>{p}</Option>)}
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="codigoPostal" label="Código Postal">
            <Input placeholder="10101" maxLength={10} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="telefono" label="Teléfono Principal *"
            rules={[{ required: true }, { pattern: /^(\+1\s?)?\(?(809|829|849)\)?[\s.-]?\d{3}[\s.-]?\d{4}$/, message: 'Formato RD: (809) 000-0000' }]}>
            <Input placeholder="(809) 000-0000" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="telefonoSecundario" label="Teléfono Secundario">
            <Input placeholder="(829) 000-0000" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="email" label="Correo Corporativo"
            rules={[{ type: 'email' }]}>
            <Input type="email" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="sitioWeb" label="Sitio Web">
            <Input placeholder="https://miempresa.com" />
          </Form.Item>
        </Col>
      </Row>

      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
        Guardar ubicación
      </Button>
    </Form>
  );
}

// ── Sección: Branding ─────────────────────────────────────────────────────────

function SeccionBranding({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);

  useEffect(() => {
    if (empresa) {
      form.setFieldsValue({
        colorPrimario:   empresa.configuracion?.colorPrimario ?? '#1a56db',
        colorSecundario: empresa.configuracion?.colorSecundario ?? '#0e4ca1',
      });
      setLogoPreview(empresa.logo ?? null);
      setFaviconPreview(empresa.favicon ?? null);
    }
  }, [empresa]);

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => configuracionApi.uploadLogo(file),
    onSuccess: (d: any) => {
      setLogoPreview(d?.url ?? d);
      qc.invalidateQueries({ queryKey: ['empresa'] });
      message.success('Logo actualizado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al subir logo'),
  });

  const removeLogoMut = useMutation({
    mutationFn: () => configuracionApi.removeLogo(),
    onSuccess: () => {
      setLogoPreview(null);
      qc.invalidateQueries({ queryKey: ['empresa'] });
      message.success('Logo eliminado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al eliminar logo'),
  });

  const uploadFaviconMut = useMutation({
    mutationFn: (file: File) => configuracionApi.uploadFavicon(file),
    onSuccess: (d: any) => {
      setFaviconPreview(d?.url ?? d);
      qc.invalidateQueries({ queryKey: ['empresa'] });
      message.success('Favicon actualizado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al subir favicon'),
  });

  const colorMut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa({
      configuracion: {
        colorPrimario:   v.colorPrimario,
        colorSecundario: v.colorSecundario,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('Colores guardados'); onSaved(); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al guardar colores'),
  });

  const beforeUploadLogo = (file: File) => {
    uploadLogoMut.mutate(file);
    return false;
  };

  const beforeUploadFavicon = (file: File) => {
    uploadFaviconMut.mutate(file);
    return false;
  };

  const colorPrimario   = Form.useWatch('colorPrimario', form) ?? '#1a56db';
  const colorSecundario = Form.useWatch('colorSecundario', form) ?? '#0e4ca1';

  return (
    <div>
      <Row gutter={24}>
        {/* Logo */}
        <Col xs={24} md={12}>
          <Card title="Logo de la empresa" size="small">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: '100%', height: 80, border: '1px dashed #d9d9d9', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: token.colorFillAlter, overflow: 'hidden',
              }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" style={{ maxHeight: 64, maxWidth: '80%', objectFit: 'contain' }} />
                  : <Text type="secondary" style={{ fontSize: 12 }}>Sin logo</Text>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Upload
                  showUploadList={false}
                  accept="image/jpeg,image/png,image/svg+xml,image/webp"
                  beforeUpload={beforeUploadLogo}
                >
                  <Button icon={<UploadOutlined />} loading={uploadLogoMut.isPending} size="small">
                    Subir logo (PNG/SVG, máx 2MB)
                  </Button>
                </Upload>
                {logoPreview && (
                  <Popconfirm
                    title="¿Eliminar el logo de la empresa?"
                    onConfirm={() => removeLogoMut.mutate()}
                    okText="Sí, eliminar"
                    cancelText="Cancelar"
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger size="small" icon={<DeleteOutlined />} loading={removeLogoMut.isPending}>
                      Quitar logo
                    </Button>
                  </Popconfirm>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 11, textAlign: 'center' }}>
                Se muestra en la barra superior del sistema y en el encabezado de facturas.
              </Text>
            </div>
          </Card>
        </Col>

        {/* Favicon */}
        <Col xs={24} md={12}>
          <Card title="Favicon" size="small">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 64, height: 64, border: '1px dashed #d9d9d9', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#fafafa', overflow: 'hidden',
              }}>
                {faviconPreview
                  ? <img src={faviconPreview} alt="Favicon" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                  : <Text type="secondary" style={{ fontSize: 11 }}>Sin favicon</Text>}
              </div>
              <Upload
                showUploadList={false}
                accept="image/png,image/x-icon,image/gif"
                beforeUpload={beforeUploadFavicon}
              >
                <Button icon={<UploadOutlined />} loading={uploadFaviconMut.isPending} size="small">
                  Subir favicon (PNG/ICO, máx 512KB)
                </Button>
              </Upload>
              <Text type="secondary" style={{ fontSize: 11, textAlign: 'center' }}>
                Ícono de la pestaña del navegador. Ideal 32×32px.
              </Text>
            </div>
          </Card>
        </Col>

        {/* Colores */}
        <Col xs={24}>
          <Card title="Colores corporativos" size="small" style={{ marginTop: 16 }}>
            <Form form={form} layout="vertical" onFinish={v => colorMut.mutate(v)}>
              <Row gutter={16} align="middle">
                <Col xs={12} sm={8}>
                  <Form.Item name="colorPrimario" label="Color primario">
                    <Input type="color" style={{ height: 42, padding: 2 }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={8}>
                  <Form.Item name="colorSecundario" label="Color secundario">
                    <Input type="color" style={{ height: 42, padding: 2 }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Button
                      style={{ background: colorPrimario, color: '#fff', border: 'none', flex: 1 }}
                      size="small"
                    >
                      Botón primario
                    </Button>
                    <Button
                      style={{ background: colorSecundario, color: '#fff', border: 'none', flex: 1 }}
                      size="small"
                    >
                      Botón secundario
                    </Button>
                  </div>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={colorMut.isPending}>
                Guardar colores
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Sección: Facturación ──────────────────────────────────────────────────────

function SeccionFacturacion({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const conf = empresa?.configuracion ?? {};

  useEffect(() => {
    form.setFieldsValue({
      moneda:                empresa?.moneda ?? 'DOP',
      diasCreditoDefecto:    conf.diasCreditoDefecto ?? empresa?.diasCreditoDefault ?? 30,
      limiteCreditoDefault:  empresa?.limiteCreditoDefault ?? 0,
      creditoHabilitado:     empresa?.creditoHabilitado ?? true,
      pieFactura:            conf.pieFactura ?? '',
      terminosCondiciones:   conf.terminosCondiciones ?? '',
      factMostrarLogo:             conf.factMostrarLogo ?? true,
      factMostrarTelefono:         conf.factMostrarTelefono ?? true,
      factMostrarEmail:            conf.factMostrarEmail ?? true,
      factMostrarWeb:              conf.factMostrarWeb ?? false,
      factMostrarOC:               conf.factMostrarOC ?? false,
      autoEmailFacturaRecurrente:  conf.autoEmailFacturaRecurrente ?? true,
      notifFactRecurrente:         conf.notifFactRecurrente ?? true,
    });
  }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => {
      const { moneda, diasCreditoDefecto, limiteCreditoDefault, creditoHabilitado, ...rest } = v;
      return configuracionApi.updateEmpresa({
        moneda,
        diasCreditoDefault:  diasCreditoDefecto,
        limiteCreditoDefault,
        creditoHabilitado,
        configuracion: { ...rest, diasCreditoDefecto },
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('Facturación guardada'); onSaved(); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const pieVal = Form.useWatch('pieFactura', form) ?? '';

  return (
    <Form form={form} layout="vertical" onFinish={v => mut.mutate(v)}>
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item name="moneda" label="Moneda por defecto">
            <Select>
              <Option value="DOP">DOP — Peso Dominicano</Option>
              <Option value="USD">USD — Dólar Americano</Option>
              <Option value="EUR">EUR — Euro</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="diasCreditoDefecto" label="Días de crédito por defecto">
            <InputNumber style={{ width: '100%' }} min={0} max={365} addonAfter="días" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="limiteCreditoDefault" label="Límite de crédito por defecto">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              addonBefore="RD$"
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v?.replace(/,/g, '')}
              placeholder="0 = sin límite"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 8 }}>
        <Col xs={24}>
          <Form.Item name="creditoHabilitado" valuePropName="checked" style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch />
              <div>
                <Text strong>Ventas a crédito habilitadas</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Permite seleccionar "Crédito" como forma de pago en facturas. Genera cuenta por cobrar automáticamente.
                </Text>
              </div>
            </div>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="pieFactura" label={
        <span>Texto de pie de factura <Text type="secondary">({pieVal?.length ?? 0}/500)</Text></span>
      }>
        <Input.TextArea rows={3} maxLength={500} placeholder="Gracias por su preferencia. Sujeto a condiciones establecidas." />
      </Form.Item>

      <Form.Item name="terminosCondiciones" label="Términos y condiciones">
        <Input.TextArea rows={4} maxLength={1000} placeholder="Condiciones de venta, devoluciones, garantías..." />
      </Form.Item>

      <Divider orientation="left" orientationMargin={0}>Campos visibles en factura impresa</Divider>
      <Row gutter={[16, 8]}>
        {[
          { name: 'factMostrarLogo',     label: 'Mostrar logo' },
          { name: 'factMostrarTelefono', label: 'Mostrar teléfono' },
          { name: 'factMostrarEmail',    label: 'Mostrar correo' },
          { name: 'factMostrarWeb',      label: 'Mostrar sitio web' },
          { name: 'factMostrarOC',       label: 'Mostrar N.° de orden de compra' },
        ].map(t => (
          <Col xs={12} sm={8} key={t.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Form.Item name={t.name} valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch size="small" />
              </Form.Item>
              <Text style={{ fontSize: 13 }}>{t.label}</Text>
            </div>
          </Col>
        ))}
      </Row>

      <Divider orientation="left" orientationMargin={0}>Notificaciones automáticas</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <Form.Item name="autoEmailFacturaRecurrente" valuePropName="checked" style={{ marginBottom: 2 }}>
            <Switch size="small" />
          </Form.Item>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>Enviar factura al cliente por email</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Al generar una factura recurrente, adjunta el PDF y lo envía automáticamente al correo del cliente.
          </Text>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="notifFactRecurrente" valuePropName="checked" style={{ marginBottom: 2 }}>
            <Switch size="small" />
          </Form.Item>
          <Text style={{ fontSize: 13, fontWeight: 600 }}>Resumen diario de facturas recurrentes</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Envía un email a los administradores con el resumen de facturas generadas por el cron diario.
          </Text>
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
          Guardar facturación
        </Button>
      </div>
    </Form>
  );
}

// ── Sección: Punto de Venta ───────────────────────────────────────────────────

function SeccionPOS({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const conf = empresa?.configuracion ?? {};

  useEffect(() => {
    form.setFieldsValue({
      posTipoImpresora:     conf.posTipoImpresora ?? '80mm',
      posMensajeTicket:     conf.posMensajeTicket ?? '',
      posPoliticaDev:       conf.posPoliticaDev ?? '',
      posEfectivo:          conf.posEfectivo ?? true,
      posTarjetaCredito:    conf.posTarjetaCredito ?? true,
      posTarjetaDebito:     conf.posTarjetaDebito ?? true,
      posTransferencia:     conf.posTransferencia ?? true,
      posCheque:            conf.posCheque ?? false,
      posVale:              conf.posVale ?? false,
      posPropinaActiva:     conf.posPropinaActiva ?? false,
      posPorcentajePropina: conf.posPorcentajePropina ?? 10,
      posCedulaMonto:       conf.posCedulaMonto ?? 50000,
      posImpresionAuto:            conf.posImpresionAuto ?? false,
      posConfirmarAnulacion:       conf.posConfirmarAnulacion ?? true,
      posModoContingencia:         conf.posModoContingencia ?? false,
      posModificarPrecio:          conf.posModificarPrecio ?? false,
      posPermitirStockNegativo:    conf.posPermitirStockNegativo ?? false,
      posRequerirCliente:          conf.posRequerirCliente ?? false,
      posPermitirDescuentos:       conf.posPermitirDescuentos ?? true,
      posDescuentoMaximo:          conf.posDescuentoMaximo ?? 100,
      posMostrarStock:             conf.posMostrarStock ?? true,
      posPermitirUsd:              conf.posPermitirUsd ?? false,
      posMontoMaximoSinSupervisor: conf.posMontoMaximoSinSupervisor ?? 0,
      supervisorModeEnabled:       conf.supervisorModeEnabled ?? false,
      maxDiscountPercent:          conf.maxDiscountPercent ?? 10,
      posSupervisorCierreCaja:     conf.posSupervisorCierreCaja !== false,
      posSupervisorGastos:         conf.posSupervisorGastos !== false,
      posPermitirAnularFacturas:   conf.posPermitirAnularFacturas ?? true,
      posTiempoLimiteAnular:       conf.posTiempoLimiteAnular ?? 0,
      posInactividadMinutos:       conf.posInactividadMinutos ?? 15,
      posBloquearFueraHorario:     conf.posBloquearFueraHorario ?? false,
      posHorarioInicio:            conf.posHorarioInicio ?? '08:00',
      posHorarioFin:               conf.posHorarioFin ?? '20:00',
      posEcfAutomatico:            conf.posEcfAutomatico ?? true,
      posMostrarEcfEnRecibo:       conf.posMostrarEcfEnRecibo ?? true,
      posPrecioIncluyeItbis:       conf.posPrecioIncluyeItbis ?? false,
      posModoPorDefecto:           conf.posModoPorDefecto ?? 'general',
      posPrecioConsultaClinica:    conf.posPrecioConsultaClinica ?? 0,
    });
  }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa({ configuracion: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('POS guardado'); onSaved(); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const propinaActiva         = Form.useWatch('posPropinaActiva',         form);
  const modoContingencia      = Form.useWatch('posModoContingencia',      form);
  const bloquearFueraHorario  = Form.useWatch('posBloquearFueraHorario',  form);
  const permitirDescuentos    = Form.useWatch('posPermitirDescuentos',    form);
  const supervisorActivo      = Form.useWatch('supervisorModeEnabled',    form);
  const inactividadMinutos    = Form.useWatch('posInactividadMinutos',    form);

  return (
    <Form form={form} layout="vertical" onFinish={v => mut.mutate(v)}>
      {modoContingencia && (
        <Alert
          type="warning"
          showIcon
          message="Modo contingencia activo"
          description="El sistema emitirá facturas sin NCF electrónico hasta desactivar este modo."
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item name="posTipoImpresora" label="Tipo de impresora">
            <Select>
              <Option value="58mm">Térmica 58mm</Option>
              <Option value="80mm">Térmica 80mm</Option>
              <Option value="carta">Hoja carta (A4)</Option>
              <Option value="ninguna">Sin impresora</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="posMensajeTicket" label="Mensaje en ticket (máx 200 chars)">
        <Input.TextArea rows={2} maxLength={200} placeholder="¡Gracias por su visita!" />
      </Form.Item>
      <Form.Item name="posPoliticaDev" label="Política de devoluciones en ticket (máx 300 chars)">
        <Input.TextArea rows={2} maxLength={300} placeholder="Devoluciones en 30 días con ticket original." />
      </Form.Item>

      <Divider orientation="left" orientationMargin={0}>Métodos de pago habilitados</Divider>
      <Row gutter={[16, 8]}>
        {[
          { name: 'posEfectivo',       label: 'Efectivo' },
          { name: 'posTarjetaCredito', label: 'Tarjeta de crédito' },
          { name: 'posTarjetaDebito',  label: 'Tarjeta de débito' },
          { name: 'posTransferencia',  label: 'Transferencia bancaria' },
          { name: 'posCheque',         label: 'Cheque' },
          { name: 'posVale',           label: 'Vale / cortesía' },
        ].map(t => (
          <Col xs={12} sm={8} key={t.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Form.Item name={t.name} valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch size="small" />
              </Form.Item>
              <Text style={{ fontSize: 13 }}>{t.label}</Text>
            </div>
          </Col>
        ))}
      </Row>

      <Divider orientation="left" orientationMargin={0}>Comportamiento</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPropinaActiva" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Propina activada</Text>
          </div>
        </Col>
        {propinaActiva && (
          <Col xs={24} sm={8}>
            <Form.Item name="posPorcentajePropina" label="% propina por defecto">
              <InputNumber style={{ width: '100%' }} min={1} max={30} addonAfter="%" />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posImpresionAuto" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Imprimir ticket automáticamente al cerrar venta</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posConfirmarAnulacion" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Pedir confirmación antes de anular venta</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posModoContingencia" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" style={{ background: modoContingencia ? '#faad14' : undefined }} />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Modo contingencia</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Form.Item name="posModificarPrecio" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch size="small" />
              </Form.Item>
              <Text style={{ fontSize: 13 }}>Permitir modificar precio en venta</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 36 }}>
              Permite al cajero editar el precio unitario de cada producto directamente en el carrito.
            </Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPermitirStockNegativo" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Permitir ventas cuando el stock es 0</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posRequerirCliente" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Requerir cliente en todas las ventas</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPermitirDescuentos" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Permitir aplicar descuentos en el carrito</Text>
          </div>
        </Col>
        {permitirDescuentos !== false && (
          <Col xs={24} sm={10}>
            <Form.Item name="posDescuentoMaximo" label="Descuento máximo permitido (%)">
              <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posMostrarStock" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Mostrar badge de stock en tarjetas de productos</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPermitirUsd" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Habilitar ventas en USD</Text>
          </div>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item name="posCedulaMonto" label="Requerir cédula en ventas mayores a">
            <InputNumber style={{ width: '100%' }} min={0} step={1000} addonAfter="DOP"
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v?.replace(/,/g, '')} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" orientationMargin={0}>Restricciones de venta</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPermitirAnularFacturas" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Permitir anular facturas desde el POS</Text>
          </div>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item name="posTiempoLimiteAnular" label="Tiempo límite para anular (minutos, 0 = sin límite)">
            <InputNumber style={{ width: '100%' }} min={0} step={5} addonAfter="min" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Divider orientation="left" orientationMargin={0}>Modo Supervisor</Divider>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="supervisorModeEnabled" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Requerir autorización de supervisor para acciones privilegiadas</Text>
          </div>
        </Col>
        {supervisorActivo && (
          <>
            <Col xs={24} sm={10}>
              <Form.Item name="maxDiscountPercent" label="Descuento máximo sin supervisor">
                <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Form.Item name="posSupervisorGastos" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch size="small" />
                </Form.Item>
                <Text style={{ fontSize: 13 }}>Requerir supervisor para Gastos</Text>
              </div>
            </Col>
          </>
        )}
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posSupervisorCierreCaja" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Requerir supervisor para Cierre de Caja</Text>
          </div>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item name="posMontoMaximoSinSupervisor" label="Monto máximo por venta sin supervisor (0 = sin límite)">
            <InputNumber style={{ width: '100%' }} min={0} step={500} addonAfter="DOP"
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v?.replace(/,/g, '')} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item name="posInactividadMinutos" label="Bloqueo automático por inactividad">
            <Select>
              <Select.Option value={1}>1 minuto</Select.Option>
              <Select.Option value={5}>5 minutos</Select.Option>
              <Select.Option value={15}>15 minutos (recomendado)</Select.Option>
              <Select.Option value={30}>30 minutos</Select.Option>
              <Select.Option value={60}>1 hora</Select.Option>
              <Select.Option value={0}>Nunca</Select.Option>
            </Select>
          </Form.Item>
          {inactividadMinutos === 0 && (
            <Alert
              type="warning"
              showIcon
              message="Sin bloqueo automático"
              description="Si el cajero deja la caja abierta, cualquier persona puede operar el POS. Usa esta opción solo en entornos de confianza."
              style={{ marginTop: -16, marginBottom: 8, fontSize: 12 }}
            />
          )}
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posBloquearFueraHorario" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Bloquear POS fuera del horario configurado</Text>
          </div>
        </Col>
        {bloquearFueraHorario && (
          <>
            <Col xs={12} sm={6}>
              <Form.Item name="posHorarioInicio" label="Horario inicio">
                <Input type="time" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="posHorarioFin" label="Horario fin">
                <Input type="time" />
              </Form.Item>
            </Col>
          </>
        )}
      </Row>

      <Divider orientation="left" orientationMargin={0}>Fiscal POS</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posEcfAutomatico" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Generar e-CF automáticamente al cobrar</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posMostrarEcfEnRecibo" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Imprimir número e-CF en el recibo térmico</Text>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Form.Item name="posPrecioIncluyeItbis" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch size="small" />
            </Form.Item>
            <Text style={{ fontSize: 13 }}>Los precios mostrados en el POS incluyen ITBIS</Text>
          </div>
        </Col>
      </Row>

      <Divider orientation="left" orientationMargin={0}>Modos de Contexto</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24} sm={8}>
          <Form.Item name="posModoPorDefecto" label="Modo por defecto al abrir POS">
            <Select>
              <Option value="general">🏪 General</Option>
              <Option value="restaurante">🍽️ Restaurante</Option>
              <Option value="taller">🔧 Taller</Option>
              <Option value="farmacia">💊 Farmacia</Option>
              <Option value="optica">👓 Óptica</Option>
              <Option value="clinica">🏥 Clínica</Option>
              <Option value="gimnasio">🏋️ Gimnasio</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="posPrecioConsultaClinica" label="Precio por defecto de consulta (Clínica)">
            <InputNumber style={{ width: '100%' }} min={0} step={100} addonBefore="RD$"
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v: any) => v?.replace(/,/g, '')} />
          </Form.Item>
        </Col>
      </Row>

      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
        Guardar POS
      </Button>
    </Form>
  );
}

// ── Sección: e-CF Estado (solo lectura) ───────────────────────────────────────

function SeccionECF({ empresaId }: { empresaId: number }) {
  const { data: config } = useQuery({
    queryKey: ['ecf-config', empresaId],
    queryFn:  () => configuracionApi.getECFConfig(empresaId),
    enabled: !!empresaId,
  });
  const { data: secuencias = [] } = useQuery<any[]>({
    queryKey: ['ecf-secuencias', empresaId],
    queryFn:  () => configuracionApi.getECFSecuencias(empresaId),
    enabled: !!empresaId,
  });

  const alertas = secuencias.filter((s: any) => {
    const pct = s.totalUsado / (s.totalDisponible + s.totalUsado || 1) * 100;
    return pct >= 80 || s.estado === 'VENCIDA' || s.estado === 'AGOTADA';
  });

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Esta sección es solo de lectura"
        description='Para modificar la configuración e-CF contacta al administrador de HiCloud.'
        action={<Button size="small" type="primary">Solicitar soporte</Button>}
        style={{ marginBottom: 16 }}
      />

      {alertas.length > 0 && (
        <Alert type="warning" showIcon icon={<WarningOutlined />}
          message={`${alertas.length} secuencia(s) requieren atención`}
          style={{ marginBottom: 16 }} />
      )}

      {config && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Text type="secondary">Proveedor</Text>
              <div><Text strong>{config.proveedor ?? 'tu proveedor e-CF'}</Text></div>
            </Col>
            <Col xs={24} sm={8}>
              <Text type="secondary">Modo</Text>
              <div>
                <Tag color={config.ambiente === 'produccion' ? 'green' : 'orange'}>
                  {config.ambiente === 'produccion' ? 'Producción' : 'Certificación'}
                </Tag>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <Text type="secondary">Estado conexión</Text>
              <div>
                <Badge status={config.activo ? 'success' : 'error'} text={config.activo ? 'Conectado' : 'Desconectado'} />
              </div>
            </Col>
          </Row>
        </Card>
      )}

      <Table
        size="small"
        scroll={{ x: 'max-content' }}
        dataSource={secuencias}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'No hay secuencias configuradas' }}
        columns={[
          { title: 'Tipo', dataIndex: 'tipoComprobante', width: 80 },
          { title: 'Prefijo', dataIndex: 'prefijo', width: 80 },
          {
            title: 'Disponibles', width: 110,
            render: (_: any, r: any) => `${r.totalDisponible ?? 0}`,
          },
          {
            title: 'Usados', width: 80,
            render: (_: any, r: any) => r.totalUsado ?? 0,
          },
          {
            title: 'Uso',
            render: (_: any, r: any) => {
              const total = (r.totalDisponible ?? 0) + (r.totalUsado ?? 0);
              const pct = total > 0 ? Math.round((r.totalUsado ?? 0) / total * 100) : 0;
              return <Progress percent={pct} size="small" strokeColor={pct >= 80 ? '#fa8c16' : '#1677ff'} style={{ width: 100 }} />;
            },
          },
          {
            title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 120,
            render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : '—',
          },
          {
            title: 'Estado', dataIndex: 'estado', width: 100,
            render: (v: string) => {
              const map: Record<string, string> = { ACTIVA: 'success', VENCIDA: 'error', AGOTADA: 'error', SUSPENDIDA: 'warning' };
              return <Badge status={(map[v] ?? 'default') as any} text={v} />;
            },
          },
        ]}
      />
    </div>
  );
}

// ── Sección: Usuarios ─────────────────────────────────────────────────────────

function SeccionUsuarios({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const [modalInvitar, setModalInvitar] = useState(false);
  const [formInv] = Form.useForm();
  const [sucModal, setSucModal] = useState<{ userId: number; nombre: string; sucursalActual: number | null } | null>(null);
  const [sucursalSel, setSucursalSel] = useState<number | null>(null);

  const { data: miembros = [], isLoading: loadMiembros } = useQuery<any[]>({
    queryKey: ['equipo-config', empresaId],
    queryFn:  () => configuracionApi.getEquipo(empresaId),
    enabled: !!empresaId,
  });
  const { data: invitaciones = [] } = useQuery<any[]>({
    queryKey: ['invitaciones-config', empresaId],
    queryFn:  () => configuracionApi.getInvitaciones(empresaId),
    enabled: !!empresaId,
  });
  const { data: sucursales = [] } = useQuery<any[]>({
    queryKey: ['sucursales-config'],
    queryFn:  () => configuracionApi.getSucursales(),
  });

  const invitar = useMutation({
    mutationFn: (v: any) => configuracionApi.invitar(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitaciones-config'] });
      setModalInvitar(false); formInv.resetFields();
      message.success('Invitación enviada por correo');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const cambiarRol = useMutation({
    mutationFn: ({ userId, rol }: { userId: number; rol: string }) =>
      configuracionApi.cambiarRol(empresaId, userId, rol),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipo-config'] }); message.success('Rol actualizado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const remover = useMutation({
    mutationFn: (userId: number) => configuracionApi.removerUsuario(empresaId, userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipo-config'] }); message.success('Usuario removido'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const cancelarInv = useMutation({
    mutationFn: (id: number) => configuracionApi.cancelarInvitacion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invitaciones-config'] }); message.success('Invitación cancelada'); },
  });

  const asignarSucursal = useMutation({
    mutationFn: ({ userId, sucursalId }: { userId: number; sucursalId: number | null }) =>
      api.patch(`/multi-empresa/${empresaId}/usuarios/${userId}/sucursal`, { sucursalId }).then((r: any) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipo-config'] });
      setSucModal(null);
      message.success('Sucursal asignada correctamente');
    },
    onError: (e: any) => message.error((e as any)?.response?.data?.message ?? 'Error al asignar sucursal'),
  });

  const pendientes = (invitaciones as any[]).filter((i: any) => i.estado === 'pendiente');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Text strong>Miembros activos ({miembros.length})</Text>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setModalInvitar(true)}>
          Invitar usuario
        </Button>
      </div>

      <Table
        size="small"
        scroll={{ x: 'max-content' }}
        loading={loadMiembros}
        dataSource={miembros}
        rowKey={(r: any) => r.userId ?? r.user?.id}
        pagination={false}
        locale={{ emptyText: 'Sin miembros — invita al primer usuario' }}
        columns={[
          {
            title: 'Usuario', width: 220,
            render: (_: any, r: any) => (
              <Space>
                <Avatar size={32} style={{ background: '#1677ff', fontSize: 13 }}>
                  {(r.user?.nombre ?? r.nombre ?? '?').charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.user?.nombre ?? r.nombre}</div>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.user?.email ?? r.email}</Text>
                </div>
              </Space>
            ),
          },
          {
            title: 'Rol', width: 160,
            render: (_: any, r: any) => (
              <Select
                size="small"
                value={r.rol}
                style={{ width: 140 }}
                onChange={(rol: string) => cambiarRol.mutate({ userId: r.userId ?? r.user?.id, rol })}
              >
                {Object.entries(ROL_INFO).filter(([k]) => k !== 'super_admin').map(([k, v]) => (
                  <Option key={k} value={k}>
                    <span style={{ color: v.color, fontWeight: 500 }}>{v.label}</span>
                  </Option>
                ))}
              </Select>
            ),
          },
          {
            title: 'Sucursal', width: 180,
            render: (_: any, r: any) => {
              const suc = (sucursales as any[]).find((s: any) => s.id === r.sucursalId);
              return suc
                ? <Tag icon={<BankOutlined />} color="blue">{suc.nombre}</Tag>
                : <Tag color="default" style={{ color: '#94a3b8' }}>Sin asignar</Tag>;
            },
          },
          {
            title: 'Acciones', width: 110, align: 'center' as const,
            render: (_: any, r: any) => (
              <Space size={4}>
                <Tooltip title="Asignar sucursal">
                  <Button
                    type="text" icon={<BankOutlined />} size="small"
                    onClick={() => {
                      setSucModal({ userId: r.userId ?? r.user?.id, nombre: r.user?.nombre ?? r.nombre ?? '?', sucursalActual: r.sucursalId ?? null });
                      setSucursalSel(r.sucursalId ?? null);
                    }}
                  />
                </Tooltip>
                <Popconfirm
                  title="¿Remover usuario de la empresa?"
                  onConfirm={() => remover.mutate(r.userId ?? r.user?.id)}
                  okText="Sí, remover" okButtonProps={{ danger: true }}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {pendientes.length > 0 && (
        <>
          <Divider orientation="left" orientationMargin={0} style={{ marginTop: 24 }}>
            Invitaciones pendientes ({pendientes.length})
          </Divider>
          <Table
            size="small"
        scroll={{ x: 'max-content' }}
            dataSource={pendientes}
            rowKey="id"
            pagination={false}
            columns={[
              { title: 'Correo', dataIndex: 'email' },
              {
                title: 'Rol', dataIndex: 'rol', width: 140,
                render: (v: string) => <Tag color={ROL_INFO[v]?.color}>{ROL_INFO[v]?.label ?? v}</Tag>,
              },
              {
                title: 'Expira', dataIndex: 'expiresAt', width: 140,
                render: (v: string) => {
                  if (!v) return '—';
                  const vencida = new Date(v) < new Date();
                  return (
                    <Text type={vencida ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                      {new Date(v).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  );
                },
              },
              {
                title: '', width: 100, align: 'center' as const,
                render: (_: any, r: any) => (
                  <Space size={4}>
                    <Tooltip title="Reenviar (genera nuevo enlace)">
                      <Button type="text" size="small" icon={<ReloadOutlined />}
                        loading={invitar.isPending}
                        onClick={() => invitar.mutate({ email: r.email, rol: r.rol })} />
                    </Tooltip>
                    <Popconfirm title="¿Cancelar invitación?" onConfirm={() => cancelarInv.mutate(r.id)}>
                      <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </>
      )}

      <Modal
        title={`Asignar sucursal — ${sucModal?.nombre ?? ''}`}
        open={!!sucModal}
        onCancel={() => setSucModal(null)}
        onOk={() => sucModal && asignarSucursal.mutate({ userId: sucModal.userId, sucursalId: sucursalSel })}
        okText="Guardar"
        confirmLoading={asignarSucursal.isPending}
        destroyOnClose
      >
        <Select
          style={{ width: '100%' }}
          value={sucursalSel}
          onChange={(v: number | null) => setSucursalSel(v)}
          allowClear
          placeholder="Sin sucursal asignada"
        >
          {(sucursales as any[]).map((s: any) => (
            <Option key={s.id} value={s.id}>{s.nombre}</Option>
          ))}
        </Select>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          Al asignar una sucursal, el usuario deberá volver a iniciar sesión para que el cambio tome efecto en el POS.
        </Text>
      </Modal>

      <Modal
        title="Invitar usuario"
        open={modalInvitar}
        onCancel={() => { setModalInvitar(false); formInv.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form form={formInv} layout="vertical" onFinish={v => invitar.mutate(v)}>
          <Form.Item name="email" label="Correo electrónico" rules={[{ required: true }, { type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="usuario@empresa.com" />
          </Form.Item>
          <Form.Item name="rol" label="Rol asignado" rules={[{ required: true }]}>
            <Select placeholder="Selecciona un rol">
              {Object.entries(ROL_INFO).filter(([k]) => k !== 'super_admin').map(([k, v]) => (
                <Option key={k} value={k}>
                  <span style={{ color: v.color, fontWeight: 500 }}>{v.label}</span>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{v.permisos[0] ?? ''}</Text>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={invitar.isPending} block icon={<MailOutlined />}>
            Enviar invitación
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

// ── Sección: Roles y Permisos (solo lectura) ──────────────────────────────────

function SeccionRoles() {
  return (
    <div>
      <Alert type="info" showIcon icon={<InfoCircleOutlined />}
        message="Los roles están predefinidos por el sistema HiCloud."
        description="Cada rol define qué módulos puede ver y editar el usuario. Para solicitar roles personalizados contacta soporte."
        style={{ marginBottom: 20 }}
      />
      <Row gutter={16}>
        {Object.entries(ROL_INFO).map(([key, info]) => (
          <Col xs={24} sm={12} key={key} style={{ marginBottom: 16 }}>
            <Card size="small" title={
              <Space>
                <Tag color={info.color} style={{ margin: 0 }}>{info.label}</Tag>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>{key}</Text>
              </Space>
            }>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {info.permisos.map(p => (
                  <li key={p} style={{ fontSize: 13 }}>
                    <CheckCircleOutlined style={{ color: info.color, marginRight: 6 }} />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

// ── Sección: Notificaciones ───────────────────────────────────────────────────

function SeccionNotificaciones({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const conf = empresa?.configuracion ?? {};

  useEffect(() => {
    form.setFieldsValue({
      notifEmail:        conf.notifEmail ?? true,
      notifPush:         conf.notifPush ?? true,
      notifVencCxC:      conf.notifVencCxC ?? true,
      notifVencCxP:      conf.notifVencCxP ?? true,
      notifStockBajo:    conf.notifStockBajo ?? true,
      notifFactRecurrente: conf.notifFactRecurrente ?? true,
      notifVencECF:      conf.notifVencECF ?? true,
    });
  }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa({ configuracion: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('Notificaciones guardadas'); onSaved(); },
    onError: () => message.error('Error al guardar'),
  });

  const toggles = [
    { name: 'notifEmail',          label: 'Notificaciones por email' },
    { name: 'notifPush',           label: 'Notificaciones push (navegador)' },
    { name: 'notifVencCxC',        label: 'Alertas de cuentas por cobrar vencidas' },
    { name: 'notifVencCxP',        label: 'Alertas de cuentas por pagar próximas' },
    { name: 'notifStockBajo',      label: 'Alertas de stock bajo (inventario)' },
    { name: 'notifFactRecurrente', label: 'Avisos de facturas recurrentes' },
    { name: 'notifVencECF',        label: 'Alertas de secuencias e-CF por vencer' },
  ];

  return (
    <Form form={form} layout="vertical" onFinish={v => mut.mutate(v)}>
      <Row gutter={[16, 8]}>
        {toggles.map(t => (
          <Col xs={24} sm={12} key={t.name}>
            <Card size="small" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>{t.label}</Text>
                <Form.Item name={t.name} valuePropName="checked" style={{ margin: 0 }}>
                  <Switch size="small" />
                </Form.Item>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
          Guardar notificaciones
        </Button>
        <Button
          icon={<BellOutlined />}
          onClick={() => {
            import('../../api/client').then(m => {
              m.default.post('/notificaciones/disparar/recordatorios-clientes').then((r: any) => {
                const n = r.data?.data?.enviados ?? 0;
                message.success(`${n} recordatorio(s) enviado(s) a clientes con CxC vencida/próxima`);
              }).catch(() => message.info('Sin CxC vencidas o emails no configurados'));
            });
          }}>
          Enviar recordatorios CxC ahora
        </Button>
      </div>
    </Form>
  );
}

// ── Sección: Seguridad ────────────────────────────────────────────────────────

function SeccionSeguridad({ empresa, onSaved }: { empresa: any; onSaved: () => void }) {
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const conf = empresa?.configuracion ?? {};

  useEffect(() => {
    form.setFieldsValue({
      sesionHoras:    conf.sesionHoras ?? 24,
      maxIntentos:    conf.maxIntentos ?? 5,
      auditoriaActiva:conf.auditoriaActiva ?? true,
    });
  }, [empresa]);

  const mut = useMutation({
    mutationFn: (v: any) => configuracionApi.updateEmpresa({ configuracion: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); message.success('Seguridad guardada'); onSaved(); },
    onError: () => message.error('Error al guardar'),
  });

  return (
    <Form form={form} layout="vertical" onFinish={v => mut.mutate(v)}>
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item name="sesionHoras" label="Duración de sesión">
            <InputNumber style={{ width: '100%' }} min={1} max={720} addonAfter="horas" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item name="maxIntentos" label="Intentos de login antes de bloquear">
            <InputNumber style={{ width: '100%' }} min={3} max={10} />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Form.Item name="auditoriaActiva" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch />
            </Form.Item>
            <div>
              <Text strong>Registro de auditoría activo</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Registra quién hace qué en el sistema (quién editó una factura, cambió un precio, etc.)
              </Text>
            </div>
          </div>
        </Col>
      </Row>

      <Alert
        type="info"
        icon={<LockOutlined />}
        showIcon
        message="La autenticación de dos factores (2FA) se configura por usuario en el perfil personal."
        style={{ marginBottom: 16 }}
      />

      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mut.isPending}>
        Guardar seguridad
      </Button>
    </Form>
  );
}

// ── Sección: Plan y Uso (solo lectura) ────────────────────────────────────────

function SeccionPlan() {
  const { data: plan } = useQuery({
    queryKey: ['suscripcion-plan'],
    queryFn:  configuracionApi.getSuscripcion,
  });

  if (!plan) return (
    <Alert type="info" showIcon message="No se encontró información del plan actual." />
  );

  const usoFacturas  = plan.facturas ?? 0;
  const limFacturas  = plan.limiteFacturas ?? 0;
  const pctFacturas  = limFacturas > 0 ? Math.round(usoFacturas / limFacturas * 100) : 0;
  const usoUsuarios  = plan.usuarios ?? 0;
  const limUsuarios  = plan.limiteUsuarios ?? 0;
  const pctUsuarios  = limUsuarios > 0 ? Math.round(usoUsuarios / limUsuarios * 100) : 0;

  return (
    <div>
      <Alert type="info" showIcon
        message="Solo lectura — para cambiar de plan ve a Sistema → Mi Suscripción y Pagos."
        style={{ marginBottom: 16 }}
        action={<Button size="small" href="/suscripcion/planes">Ver planes</Button>}
      />
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card size="small" title="Plan actual">
            <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>{plan.plan ?? '—'}</Tag>
            {plan.fechaVencimiento && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Vence: {new Date(plan.fechaVencimiento).toLocaleDateString('es-DO')}
                </Text>
              </div>
            )}
          </Card>
        </Col>
        {limFacturas > 0 && (
          <Col xs={24} sm={8}>
            <Card size="small" title="Facturas emitidas">
              <Progress percent={pctFacturas} size="small" />
              <Text style={{ fontSize: 12 }}>{usoFacturas.toLocaleString()} / {limFacturas.toLocaleString()}</Text>
            </Card>
          </Col>
        )}
        {limUsuarios > 0 && (
          <Col xs={24} sm={8}>
            <Card size="small" title="Usuarios activos">
              <Progress percent={pctUsuarios} size="small" />
              <Text style={{ fontSize: 12 }}>{usoUsuarios} / {limUsuarios}</Text>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}

// ── Sección: Auditoría (solo lectura) ─────────────────────────────────────────

function SeccionAuditoria() {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ['auditoria-reciente'],
    queryFn:  configuracionApi.getAuditoriaReciente,
  });

  return (
    <div>
      <Alert type="info" showIcon
        message="Muestra las últimas 20 acciones críticas e importantes. Para ver el historial completo ve al módulo Auditoría."
        style={{ marginBottom: 16 }}
        action={<Button size="small" href="/auditoria">Ir a Auditoría</Button>}
      />
      <Table
        size="small"
        scroll={{ x: 'max-content' }}
        loading={isLoading}
        dataSource={logs}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'Sin acciones críticas/importantes recientes' }}
        columns={[
          {
            title: 'Fecha', dataIndex: 'createdAt', width: 140,
            render: (v: string) => new Date(v).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }),
          },
          {
            title: 'Nivel', dataIndex: 'nivel', width: 100,
            render: (v: string) => {
              if (v === 'CRITICO')    return <Tag color="red">Crítico</Tag>;
              if (v === 'IMPORTANTE') return <Tag color="orange">Importante</Tag>;
              return <Tag>Normal</Tag>;
            },
          },
          { title: 'Usuario', dataIndex: 'userName', width: 160 },
          {
            title: 'Acción', dataIndex: 'accion', width: 120,
            render: (v: string) => {
              const c: Record<string, string> = { create: 'green', update: 'blue', delete: 'red', login: 'cyan', logout: 'orange', error: 'red' };
              return <Tag color={c[v]}>{v?.toUpperCase()}</Tag>;
            },
          },
          { title: 'Módulo', dataIndex: 'modulo', width: 110, render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Detalle', dataIndex: 'descripcion', ellipsis: true },
        ]}
      />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('datos');
  const [collapsed, setCollapsed] = useState(window.innerWidth < 1024);
  const empresaActual = useAuthStore(s => s.empresaActual);
  const empresaId = Number(empresaActual ?? localStorage.getItem('empresaId') ?? 1);

  const { data: empresa, isLoading } = useQuery({
    queryKey: ['empresa'],
    queryFn:  configuracionApi.getEmpresa,
  });

  const handleSaved = useCallback(() => {}, []);

  const sectionLabel = SIDEBAR_GROUPS
    .flatMap(g => g.items)
    .find(i => i.key === activeSection)?.label ?? '';

  const renderContent = () => {
    if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

    switch (activeSection) {
      case 'datos':         return <SeccionDatos empresa={empresa} onSaved={handleSaved} />;
      case 'ubicacion':     return <SeccionUbicacion empresa={empresa} onSaved={handleSaved} />;
      case 'branding':      return <SeccionBranding empresa={empresa} onSaved={handleSaved} />;
      case 'facturacion':   return <SeccionFacturacion empresa={empresa} onSaved={handleSaved} />;
      case 'pos':           return <SeccionPOS empresa={empresa} onSaved={handleSaved} />;
      case 'ecf':           return <SeccionECF empresaId={empresaId} />;
      case 'usuarios':      return <SeccionUsuarios empresaId={empresaId} />;
      case 'roles':         return <SeccionRoles />;
      case 'notificaciones':return <SeccionNotificaciones empresa={empresa} onSaved={handleSaved} />;
      case 'seguridad':     return <SeccionSeguridad empresa={empresa} onSaved={handleSaved} />;
      case 'plan':          return <SeccionPlan />;
      case 'auditoria':     return <SeccionAuditoria />;
      default:              return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }} className="config-layout">
      <style>{`
        @media (max-width: 768px) {
          .config-layout { height: auto !important; overflow: visible !important; flex-direction: column; }
          .config-sidebar { display: none !important; }
          .config-content { padding: 0 0 24px !important; overflow-y: visible !important; height: auto !important; }
          .config-section-nav { display: flex !important; overflow-x: auto; padding: 0 0 8px; gap: 4px; margin-bottom: 16px; }
        }
        @media (min-width: 769px) {
          .config-section-nav { display: none !important; }
        }
      `}</style>
      <div className="config-sidebar" style={{ display: 'contents' }}>
        <ConfigSidebar
          active={activeSection}
          onSelect={setActiveSection}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
        />
      </div>
      {/* Mobile nav — horizontal scroll de secciones */}
      <div className="config-section-nav" style={{ display: 'none' }}>
        {SIDEBAR_GROUPS.flatMap(g => g.items).map(item => (
          <button
            key={item.key}
            onClick={() => setActiveSection(item.key)}
            style={{
              padding: '6px 12px', borderRadius: 20, border: '1px solid',
              borderColor: activeSection === item.key ? '#1a56db' : '#d9d9d9',
              background: activeSection === item.key ? '#1a56db' : 'transparent',
              color: activeSection === item.key ? '#fff' : 'inherit',
              fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
            }}
          >{item.label}</button>
        ))}
      </div>
      <div className="config-content" style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        <div style={{ marginBottom: 20, paddingTop: 4 }}>
          <Title level={4} style={{ margin: 0 }}>{sectionLabel}</Title>
          {empresa && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {empresa.nombre} · RNC {empresa.rnc}
            </Text>
          )}
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
