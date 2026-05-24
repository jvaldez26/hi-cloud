import { useState, useCallback } from 'react';
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
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { clientesApi, type ClientePayload } from '../../api/clientes.api';
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

  const puedeCrear        = useCanDo('clientes:crear');
  const puedeEliminar     = useCanDo('clientes:eliminar');
  const puedeEstadoCuenta = useCanDo('clientes:estado_cuenta');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form]                = Form.useForm<ClientePayload>();
  const qc = useQueryClient();

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

  const openCreate = () => { setEditing(null); form.resetFields(); setOpen(true); };
  const openEdit   = (c: Cliente) => { setEditing(c); form.setFieldsValue({ ...c, diasCredito: (c as any).diasCredito ?? 30 }); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); form.resetFields(); };
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
            {r.rfc && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.rfc}</Text></div>}
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

      {/* Modal crear/editar */}
      <Modal
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
        open={open} onCancel={closeModal} footer={null}
        width="min(680px, 95vw)" destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col xs={24} sm={16}>
              <Form.Item name="nombre" label="Nombre / Razón Social" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="rfc" label="RNC / Cédula"
                rules={[
                  { required: true, message: 'El RNC o Cédula es requerido' },
                  {
                    pattern: /^\d{9}$|^\d{11}$/,
                    message: 'RNC debe tener 9 dígitos o Cédula debe tener 11 dígitos',
                  },
                ]}>
                <Input placeholder="9 dígitos (RNC) u 11 dígitos (Cédula)" maxLength={11} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="rncReceptor" label="RNC Receptor (e-CF)"
                rules={[{ pattern: /^\d{9}$|^\d{11}$/, message: '9 u 11 dígitos' }]}>
                <Input placeholder="9 u 11 dígitos" maxLength={11} />
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
