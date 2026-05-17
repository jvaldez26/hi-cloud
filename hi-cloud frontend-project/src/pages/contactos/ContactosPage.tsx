import { useState } from 'react';
import {
  Card, Row, Col, Input, Select, Table, Tag, Typography,
  Statistic, Space, Button, Avatar, Tooltip, theme,
} from 'antd';
import {
  TeamOutlined, SearchOutlined, PhoneOutlined, MailOutlined,
  CopyOutlined, UserOutlined, ShoppingOutlined, BuildOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const TIPO_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode; ruta: string }> = {
  cliente:   { color: 'blue',    label: 'Cliente',    icon: <UserOutlined />,      ruta: '/clientes' },
  proveedor: { color: 'purple',  label: 'Proveedor',  icon: <BuildOutlined />,     ruta: '/proveedores' },
  empleado:  { color: 'green',   label: 'Empleado',   icon: <TeamOutlined />,      ruta: '/nomina' },
};

const COLORES_AVATAR = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2'];

export default function ContactosPage() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string | undefined>();
  const [vista, setVista] = useState<'tabla' | 'tarjetas'>('tarjetas');

  const { data: resumen } = useQuery<any>({
    queryKey: ['contactos-resumen'],
    queryFn: () => api.get('/contactos/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: contactos = [], isLoading } = useQuery<any[]>({
    queryKey: ['contactos', tipoFiltro, busqueda],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tipoFiltro) params.set('tipo', tipoFiltro);
      if (busqueda.length >= 2) params.set('q', busqueda);
      return api.get(`/contactos?${params}`).then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); });
    },
    staleTime: 30_000,
  });

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Contactos</Title>
            <Text type="secondary">Directorio unificado de clientes, proveedores y empleados</Text>
          </div>
        </div>
        <Space>
          <Button
            type={vista === 'tarjetas' ? 'primary' : 'default'}
            onClick={() => setVista('tarjetas')}
          >Tarjetas</Button>
          <Button
            type={vista === 'tabla' ? 'primary' : 'default'}
            onClick={() => setVista('tabla')}
          >Tabla</Button>
        </Space>
      </div>

      {/* Filtros */}
      <Card bordered={false} style={{ borderRadius: 10, marginBottom: 16, background: token.colorFillAlter }}>
        <Row gutter={12} align="middle">
          <Col flex={1}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Buscar por nombre, email, teléfono, RNC..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              allowClear
            />
          </Col>
          <Col>
            <Select
              allowClear
              placeholder="Todos los tipos"
              value={tipoFiltro}
              onChange={setTipoFiltro}
              style={{ width: 180 }}
            >
              <Option value="cliente">Clientes</Option>
              <Option value="proveedor">Proveedores</Option>
              <Option value="empleado">Empleados</Option>
            </Select>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>{contactos.length} resultado(s)</Text>
          </Col>
        </Row>
      </Card>

      {/* Vista Tarjetas */}
      {vista === 'tarjetas' && (
        <Row gutter={[12, 12]}>
          {contactos.map((c: any, idx: number) => {
            const conf = TIPO_CONFIG[c.tipo];
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={c.id}>
                <Card
                  bordered={false}
                  size="small"
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`${conf.ruta}/${c.origenId}`)}
                  hoverable
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Avatar
                      size={38}
                      style={{ background: COLORES_AVATAR[idx % COLORES_AVATAR.length], fontWeight: 700, flexShrink: 0 }}
                    >
                      {c.nombre?.charAt(0).toUpperCase()}
                    </Avatar>
                    <div style={{ overflow: 'hidden' }}>
                      <Text strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.nombre}
                      </Text>
                      <Tag color={conf?.color} style={{ fontSize: 10, marginTop: 2 }}>
                        {conf?.icon} {conf?.label}
                      </Tag>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: token.colorTextSecondary, lineHeight: 1.8 }}>
                    {c.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          <MailOutlined style={{ marginRight: 4 }} />{c.email}
                        </span>
                        <Tooltip title="Copiar email">
                          <CopyOutlined style={{ cursor: 'pointer', fontSize: 11 }} onClick={e => { e.stopPropagation(); copiar(c.email); }} />
                        </Tooltip>
                      </div>
                    )}
                    {c.telefono && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
                        <span><PhoneOutlined style={{ marginRight: 4 }} />{c.telefono}</span>
                        <Tooltip title="Copiar teléfono">
                          <CopyOutlined style={{ cursor: 'pointer', fontSize: 11 }} onClick={e => { e.stopPropagation(); copiar(c.telefono); }} />
                        </Tooltip>
                      </div>
                    )}
                    {c.rnc && <div>RNC: {c.rnc}</div>}
                  </div>
                </Card>
              </Col>
            );
          })}
          {!isLoading && contactos.length === 0 && (
            <Col span={24} style={{ textAlign: 'center', padding: 48 }}>
              <TeamOutlined style={{ fontSize: 48, color: token.colorTextDisabled }} />
              <div style={{ marginTop: 12 }}><Text type="secondary">No se encontraron contactos</Text></div>
            </Col>
          )}
        </Row>
      )}

      {/* Vista Tabla */}
      {vista === 'tabla' && (
        <Card bordered={false} style={{ borderRadius: 12 }}>
          <Table
            dataSource={contactos}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={{ pageSize: 20 }}
            columns={[
              {
                title: 'Nombre', dataIndex: 'nombre', key: 'n',
                render: (v, r: any) => (
                  <Space>
                    <Avatar size="small" style={{ background: TIPO_CONFIG[r.tipo]?.color === 'blue' ? '#1a56db' : TIPO_CONFIG[r.tipo]?.color === 'purple' ? '#7c3aed' : '#059669' }}>
                      {v?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Text strong>{v}</Text>
                  </Space>
                ),
              },
              {
                title: 'Tipo', dataIndex: 'tipo', key: 't',
                render: v => {
                  const conf = TIPO_CONFIG[v];
                  return <Tag color={conf?.color}>{conf?.label}</Tag>;
                },
              },
              {
                title: 'Email', dataIndex: 'email', key: 'e',
                render: v => v ? (
                  <Space>
                    <Text style={{ fontSize: 12 }}>{v}</Text>
                    <CopyOutlined style={{ cursor: 'pointer', fontSize: 11, color: token.colorTextSecondary }} onClick={() => copiar(v)} />
                  </Space>
                ) : <Text type="secondary">—</Text>,
              },
              {
                title: 'Teléfono', dataIndex: 'telefono', key: 'tel',
                render: v => v ? (
                  <Space>
                    <Text style={{ fontSize: 12 }}>{v}</Text>
                    <CopyOutlined style={{ cursor: 'pointer', fontSize: 11, color: token.colorTextSecondary }} onClick={() => copiar(v)} />
                  </Space>
                ) : <Text type="secondary">—</Text>,
              },
              { title: 'RNC', dataIndex: 'rnc', key: 'r', render: v => v || <Text type="secondary">—</Text> },
              {
                title: '', key: 'acc',
                render: (_, r: any) => (
                  <Button size="small" onClick={() => navigate(`${TIPO_CONFIG[r.tipo]?.ruta}`)}>
                    Ver
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
