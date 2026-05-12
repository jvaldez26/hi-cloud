import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input,
  Space, Typography, Popconfirm, message, Avatar, Tooltip,
  Switch,
} from 'antd';
import {
  BankOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  StarOutlined, StarFilled, PhoneOutlined, MailOutlined,
  EnvironmentOutlined, UserOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;

const COLORES = ['#1a56db','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#db2777'];

export default function SucursalesPage() {
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando]         = useState<any>(null);
  const [form] = Form.useForm();

  const { data: sucursales = [], isLoading } = useQuery<any[]>({
    queryKey: ['sucursales'],
    queryFn:  () => api.get('/sucursales').then((r: any) => r.data?.data ?? r.data),
  });

  const onErr = (e: any, fallback: string) =>
    message.error((e as any)?.friendlyMessage ?? fallback);

  const crearActualizar = useMutation({
    mutationFn: (dto: any) => editando
      ? api.patch(`/sucursales/${editando.id}`, dto)
      : api.post('/sucursales', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      setModalVisible(false);
      setEditando(null);
      form.resetFields();
      message.success(editando ? 'Sucursal actualizada' : 'Sucursal creada');
    },
    onError: (e: any) => onErr(e, editando ? 'Error al actualizar' : 'Error al crear sucursal'),
  });

  const setPrincipal = useMutation({
    mutationFn: (id: number) => api.patch(`/sucursales/${id}/principal`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      message.success('Sucursal principal actualizada');
    },
    onError: (e: any) => onErr(e, 'Error al cambiar sucursal principal'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/sucursales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sucursales'] });
      message.success('Sucursal eliminada');
    },
    onError: (e: any) => onErr(e, 'No se puede eliminar la sucursal principal'),
  });

  const abrirEditar = (suc: any) => {
    setEditando(suc);
    form.setFieldsValue(suc);
    setModalVisible(true);
  };

  const abrirCrear = () => {
    setEditando(null);
    form.resetFields();
    setModalVisible(true);
  };

  const principal = sucursales.find((s: any) => s.esPrincipal);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BankOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Sucursales</Title>
            <Text type="secondary">Gestiona las sedes y puntos de venta de tu empresa</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const { data: sData } = ({ data: sucursales });
            const filas = (sucursales ?? []).map((s: any) => ({
              'Código':      s.codigo ?? '',
              'Nombre':      s.nombre ?? '',
              'Ciudad':      s.ciudad ?? '',
              'Teléfono':    s.telefono ?? '',
              'Email':       s.email ?? '',
              'Principal':   s.esPrincipal ? 'Sí' : 'No',
              'Activa':      s.isActive !== false ? 'Sí' : 'No',
            }));
            exportarExcel(filas, 'Sucursales');
          }}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrear}>
            Nueva Sucursal
          </Button>
        </Space>
      </div>

      {/* Sucursal principal destacada */}
      {principal && (
        <Card
          bordered={false}
          style={{
            background: 'linear-gradient(135deg,#1a56db,#3b82f6)',
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <Row align="middle" gutter={16}>
            <Col>
              <Avatar size={56} style={{ background: 'rgba(255,255,255,.2)', fontSize: 22, fontWeight: 800 }}>
                {principal.nombre?.charAt(0)}
              </Avatar>
            </Col>
            <Col flex={1}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{principal.nombre}</Text>
                <Tag style={{ background: '#fbbf24', color: '#78350f', border: 'none', fontWeight: 600 }}>
                  <StarFilled /> Principal
                </Tag>
              </div>
              <Space style={{ marginTop: 4 }}>
                {principal.direccion && (
                  <Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 13 }}>
                    <EnvironmentOutlined /> {principal.ciudad ?? principal.direccion}
                  </Text>
                )}
                {principal.telefono && (
                  <Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 13 }}>
                    <PhoneOutlined /> {principal.telefono}
                  </Text>
                )}
                {principal.email && (
                  <Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 13 }}>
                    <MailOutlined /> {principal.email}
                  </Text>
                )}
              </Space>
            </Col>
            <Col>
              <Tag style={{ background: 'rgba(255,255,255,.2)', borderColor: 'transparent', color: '#fff' }}>
                {principal.codigo}
              </Tag>
            </Col>
          </Row>
        </Card>
      )}

      {/* Grid de sucursales */}
      <Row gutter={[16, 16]}>
        {sucursales.map((suc: any, idx: number) => {
          const color = COLORES[idx % COLORES.length];
          return (
            <Col xs={24} sm={12} lg={8} key={suc.id}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 12,
                  border: suc.esPrincipal ? `2px solid ${color}` : '1px solid #e5e7eb',
                }}
                actions={[
                  <Tooltip title="Editar">
                    <EditOutlined onClick={() => abrirEditar(suc)} />
                  </Tooltip>,
                  <Tooltip title={suc.esPrincipal ? 'Es la principal' : 'Marcar como principal'}>
                    {suc.esPrincipal
                      ? <StarFilled style={{ color: '#fbbf24' }} />
                      : <StarOutlined onClick={() => setPrincipal.mutate(suc.id)} />
                    }
                  </Tooltip>,
                  suc.esPrincipal ? (
                    <Tooltip title="No se puede eliminar la sucursal principal">
                      <DeleteOutlined style={{ color: '#d1d5db' }} />
                    </Tooltip>
                  ) : (
                    <Popconfirm
                      title="¿Eliminar sucursal?"
                      onConfirm={() => eliminar.mutate(suc.id)}
                    >
                      <DeleteOutlined style={{ color: '#ef4444' }} />
                    </Popconfirm>
                  ),
                ]}
              >
                <Space style={{ marginBottom: 12 }}>
                  <Avatar style={{ background: color, fontWeight: 700 }}>
                    {suc.nombre?.charAt(0)}
                  </Avatar>
                  <div>
                    <Text strong>{suc.nombre}</Text>
                    <Tag style={{ marginLeft: 6, fontSize: 10 }}>{suc.codigo}</Tag>
                    {suc.esPrincipal && <Tag color="gold" style={{ fontSize: 10 }}>Principal</Tag>}
                  </div>
                </Space>

                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 2 }}>
                  {suc.ciudad && (
                    <div><EnvironmentOutlined style={{ marginRight: 6 }} />{suc.ciudad}</div>
                  )}
                  {suc.direccion && (
                    <div style={{ paddingLeft: 18, color: '#9ca3af' }}>{suc.direccion}</div>
                  )}
                  {suc.telefono && (
                    <div><PhoneOutlined style={{ marginRight: 6 }} />{suc.telefono}</div>
                  )}
                  {suc.email && (
                    <div><MailOutlined style={{ marginRight: 6 }} />{suc.email}</div>
                  )}
                  {suc.notas && (
                    <div style={{ marginTop: 8, color: '#9ca3af', fontStyle: 'italic' }}>{suc.notas}</div>
                  )}
                </div>
              </Card>
            </Col>
          );
        })}

        {sucursales.length === 0 && !isLoading && (
          <Col span={24}>
            <Card bordered={false} style={{ textAlign: 'center', padding: 48, borderRadius: 12 }}>
              <BankOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <div>
                <Text type="secondary">No hay sucursales. Crea la primera sede de tu empresa.</Text>
              </div>
              <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 16 }} onClick={abrirCrear}>
                Crear Sucursal
              </Button>
            </Card>
          </Col>
        )}
      </Row>

      {/* Modal crear/editar */}
      <Modal
        title={
          <Space>
            <BankOutlined />
            {editando ? `Editar — ${editando.nombre}` : 'Nueva Sucursal'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditando(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={crearActualizar.isPending}
        okText={editando ? 'Actualizar' : 'Crear'}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={v => crearActualizar.mutate(v)}>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="codigo" label="Código" rules={[{ required: true }]}>
                <Input placeholder="SUC-001" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}>
                <Input placeholder="Sucursal Santo Domingo Centro" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="direccion" label="Dirección">
            <Input placeholder="Av. Winston Churchill #101" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ciudad" label="Ciudad">
                <Input placeholder="Santo Domingo" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input placeholder="809-000-0000" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="Email">
            <Input placeholder="sucursal@empresa.com" />
          </Form.Item>
          <Form.Item name="esPrincipal" valuePropName="checked" label="¿Es la sucursal principal?">
            <Switch />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} placeholder="Horario, instrucciones especiales..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
