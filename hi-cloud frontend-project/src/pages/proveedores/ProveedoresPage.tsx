import { useState, useCallback } from 'react';
import {
  Table, Button, Input, Space, Modal, Form, Row, Col,
  Typography, Popconfirm, message, Card, Select, InputNumber,
  Avatar, Tag, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  FileExcelOutlined, PhoneOutlined, MailOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { proveedoresApi, type ProveedorPayload } from '../../api/proveedores.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Proveedor } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const CATEGORIAS = ['Materia prima', 'Servicios', 'Tecnología', 'Logística', 'Limpieza', 'Papelería', 'Alimentos', 'Otro'];

export default function ProveedoresPage() {
  const { token } = theme.useToken();
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [form] = Form.useForm<ProveedorPayload>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', page, search],
    queryFn:  () => proveedoresApi.list(page, 15, search),
  });

  const createMut = useMutation({
    mutationFn: proveedoresApi.create,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); closeModal(); message.success('Proveedor creado'); },
    onError:    (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al crear'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProveedorPayload> }) => proveedoresApi.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); closeModal(); message.success('Proveedor actualizado'); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: proveedoresApi.remove,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); message.success('Eliminado'); },
    onError:    (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar'),
  });

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (p: Proveedor) => { setEditing(p); form.setFieldsValue(p); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); form.resetFields(); };
  const handleSubmit = (v: ProveedorPayload) =>
    editing ? updateMut.mutate({ id: editing.id, body: v }) : createMut.mutate(v);

  const handleExcel = useCallback(async () => {
    const all = await proveedoresApi.list(1, 5000, search);
    const filas = (all?.data ?? []).map((p: Proveedor) => ({
      'Nombre':    p.nombre,
      'RNC':       p.rnc ?? '',
      'Teléfono':  p.telefono ?? '',
      'Email':     p.email ?? '',
      'Dirección': (p as any).direccion ?? '',
      'Contacto':  (p as any).contacto ?? '',
    }));
    exportarExcel(filas, `Proveedores-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} proveedores exportados`);
  }, [search]);

  const columns = [
    {
      title: 'Proveedor', key: 'nombre', ellipsis: true,
      render: (_: unknown, r: Proveedor) => (
        <Space>
          <Avatar size={30} style={{ background: '#7c3aed', flexShrink: 0, fontSize: 12 }}>
            {r.nombre.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Text strong style={{ fontSize: 13 }}>{r.nombre}</Text>
            {r.rnc && <div><Text type="secondary" style={{ fontSize: 11 }}>RNC: {r.rnc}</Text></div>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Contacto', key: 'contacto', width: 200,
      render: (_: unknown, r: Proveedor) => (
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
    {
      title: 'Contacto', dataIndex: 'contacto', width: 130,
      render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Estado', dataIndex: 'isActive', width: 80,
      render: (v: boolean) => <Tag color={v !== false ? 'green' : 'red'}>{v !== false ? 'Activo' : 'Inactivo'}</Tag>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'right' as const,
      render: (_: unknown, r: Proveedor) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="¿Eliminar proveedor?" onConfirm={() => deleteMut.mutate(r.id)}
            okText="Eliminar" okButtonProps={{ danger: true }}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Proveedores</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} proveedores
            </Text>
          )}
        </Col>
        <Col>
          <Space>
            <Input
              placeholder="Nombre, RNC..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: 240 }}
            />
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo proveedor</Button>
          </Space>
        </Col>
      </Row>

      <Table
        columns={columns} dataSource={data?.data ?? []} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          total: data?.meta.total, pageSize: 15, current: page,
          onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} proveedores`,
          showSizeChanger: false, size: 'small',
        }}
      />

      <Modal
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
        open={open} onCancel={closeModal} footer={null} width={640} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Form.Item name="nombre" label="Nombre / Razón Social" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="rnc" label="RNC"
                rules={[{ required: true }, { pattern: /^\d{9}$|^\d{11}$/, message: '9 u 11 dígitos' }]}>
                <Input placeholder="130000001" maxLength={11} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="telefono" label="Teléfono">
                <Input placeholder="(809) 000-0000" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={14}>
              <Form.Item name="direccion" label="Dirección">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="contacto" label="Persona de Contacto">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="categoria" label="Categoría">
                <Select allowClear>
                  {CATEGORIAS.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="diasPago" label="Días de pago">
                <InputNumber style={{ width: '100%' }} min={0} max={365} addonAfter="días" placeholder="30" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="banco" label="Banco">
                <Select allowClear>
                  {['Banreservas','BHD León','Popular','ScotiaBank','APAP','BancoSanta Cruz','Asociación Cibao','Otro']
                    .map(b => <Option key={b} value={b}>{b}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="cuentaBancaria" label="Número de cuenta">
                <Input placeholder="000-0000000-0" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notas" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={closeModal}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending}>
                {editing ? 'Actualizar' : 'Crear proveedor'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
}
