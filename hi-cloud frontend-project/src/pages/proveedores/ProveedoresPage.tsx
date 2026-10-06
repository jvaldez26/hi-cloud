import { useState, useCallback } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Input, Space, Row, Col,
  Typography, Popconfirm, message, Card, Tag, Tooltip, theme, Avatar,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  FileExcelOutlined, PhoneOutlined, MailOutlined,
} from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { proveedoresApi } from '../../api/proveedores.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Proveedor } from '../../types';
import ProveedorFormModal from '../../components/proveedores/ProveedorFormModal';

const { Title, Text } = Typography;

export default function ProveedoresPage() {
  const { token } = theme.useToken();
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [open,           setOpen]           = useState(false);
  const [editing,        setEditing]        = useState<Proveedor | null>(null);
  const [detalleProveedor, setDetalleProveedor] = useState<Proveedor | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', page, search],
    queryFn:  () => proveedoresApi.list(page, 15, search),
  });

  const deleteMut = useMutation({
    mutationFn: proveedoresApi.remove,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); message.success('Eliminado'); },
    onError:    (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar'),
  });

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit   = (p: Proveedor) => { setEditing(p); setOpen(true); };
  const closeModal = () => { setOpen(false); setEditing(null); };

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

  const COLS_DEF = [
    { key: 'nombre',   label: 'Proveedor', defaultVisible: true  },
    { key: 'contacto', label: 'Contacto',  defaultVisible: true  },
    { key: 'isActive', label: 'Estado',    defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('proveedores', COLS_DEF);

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
        <TableActions
          onView={() => setDetalleProveedor(r)}
          viewLabel="Ver proveedor"
          items={[
            { key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEdit(r) },
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar', danger: true, icon: <DeleteOutlined />, onClick: () => deleteMut.mutate(r.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Proveedores</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} proveedores
            </Text>
          )}
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Nombre, RNC..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear style={{ width: '100%', maxWidth: 240 }}
            />
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['proveedores']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo proveedor</Button>
          </Space>
        </Col>
      </Row>

      <Table
        columns={filterColumns(columns)} dataSource={data?.data ?? []} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{
          total: data?.meta.total, pageSize: 10, current: page,
          onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} proveedores`,
          showSizeChanger: false, size: 'small',
        }}
      />

      <ProveedorFormModal
        open={open}
        editing={editing}
        onClose={closeModal}
      />

      <DetailDrawer
        open={!!detalleProveedor}
        onClose={() => setDetalleProveedor(null)}
        title={detalleProveedor?.nombre ?? 'Proveedor'}
        sections={[{
          fields: [
            { label: 'RNC',       value: detalleProveedor?.rnc },
            { label: 'Estado',    value: <Tag color={detalleProveedor?.isActive !== false ? 'green' : 'red'}>{detalleProveedor?.isActive !== false ? 'Activo' : 'Inactivo'}</Tag> },
            { label: 'Email',     value: detalleProveedor?.email },
            { label: 'Teléfono',  value: detalleProveedor?.telefono },
            { label: 'Dirección', value: (detalleProveedor as any)?.direccion, span: 2 },
            { label: 'Contacto',  value: (detalleProveedor as any)?.contacto },
            { label: 'Días crédito', value: (detalleProveedor as any)?.diasCredito !== undefined ? `${(detalleProveedor as any).diasCredito} días` : undefined },
          ],
        }]}
      />
    </Card>
  );
}
