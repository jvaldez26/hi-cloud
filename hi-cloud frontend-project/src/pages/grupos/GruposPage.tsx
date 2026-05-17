import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  InputNumber, Space, Typography, Tabs, Popconfirm, message, Tree,
  theme, Divider,
} from 'antd';
import {
  AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  TeamOutlined, FolderOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

function buildTreeData(grupos: any[]): any[] {
  const map = new Map(grupos.map((g: any) => [g.id, { ...g, key: g.id, title: `${g.codigo} — ${g.nombre}`, children: [] }]));
  const roots: any[] = [];
  map.forEach(g => {
    if (g.parentId && map.has(g.parentId)) {
      map.get(g.parentId).children.push(g);
    } else {
      roots.push(g);
    }
  });
  return roots;
}

export default function GruposPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [tabActiva, setTabActiva] = useState('productos');
  const [modalVisible, setModalVisible] = useState(false);
  const [editando,     setEditando]     = useState<any>(null);
  const [tipo, setTipo] = useState<'grupo' | 'segmento'>('grupo');
  const [formG] = Form.useForm();
  const [formS] = Form.useForm();

  const { data: gruposFlat = [] } = useQuery<any[]>({
    queryKey: ['grupos-productos'],
    queryFn:  () => api.get('/grupos/productos').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: segmentos = [] } = useQuery<any[]>({
    queryKey: ['segmentos-clientes'],
    queryFn:  () => api.get('/grupos/clientes').then((r: any) => r.data?.data ?? r.data),
  });

  const flatGrupos = (arr: any[]): any[] =>
    arr.flatMap((g: any) => [g, ...flatGrupos(g.children ?? [])]);

  const allGrupos = flatGrupos(gruposFlat);

  const mutGrupo = useMutation({
    mutationFn: (dto: any) => editando
      ? api.patch(`/grupos/productos/${editando.id}`, dto)
      : api.post('/grupos/productos', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos-productos'] }); setModalVisible(false); formG.resetFields(); message.success('Guardado'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const mutSegmento = useMutation({
    mutationFn: (dto: any) => editando
      ? api.patch(`/grupos/clientes/${editando.id}`, dto)
      : api.post('/grupos/clientes', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['segmentos-clientes'] }); setModalVisible(false); formS.resetFields(); message.success('Guardado'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const delGrupo   = useMutation({ mutationFn: (id: number) => api.delete(`/grupos/productos/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['grupos-productos'] }) });
  const delSegment = useMutation({ mutationFn: (id: number) => api.delete(`/grupos/clientes/${id}`),  onSuccess: () => qc.invalidateQueries({ queryKey: ['segmentos-clientes']  }) });

  const abrirGrupo = (g?: any) => { setTipo('grupo'); setEditando(g ?? null); if (g) formG.setFieldsValue(g); else formG.resetFields(); setModalVisible(true); };
  const abrirSeg   = (s?: any) => { setTipo('segmento'); setEditando(s ?? null); if (s) formS.setFieldsValue(s); else formS.resetFields(); setModalVisible(true); };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppstoreOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Grupos & Segmentos</Title>
            <Text type="secondary">Organiza productos y clasifica clientes por segmentos de negocio</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const src   = tabActiva === 'productos' ? gruposFlat : segmentos;
            const filas = (src ?? []).map((g: any) => ({
              'Código':    g.codigo ?? '',
              'Nombre':    g.nombre ?? '',
              'Descripción':g.descripcion ?? '',
              'Productos': g.totalProductos ?? g.cantidadProductos ?? 0,
              'Activo':    g.activo !== false ? 'Sí' : 'No',
            }));
            exportarExcel(filas, tabActiva === 'productos' ? 'Grupos-Producto' : 'Segmentos-Cliente');
          }}>Excel</Button>
            <RefreshByKeyButton queryKey={['grupos']} />
            <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => tabActiva === 'productos' ? abrirGrupo() : abrirSeg()}>
            {tabActiva === 'productos' ? 'Nuevo Grupo' : 'Nuevo Segmento'}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={tabActiva}
        onChange={setTabActiva}
        items={[
          {
            key: 'productos',
            label: <Space><FolderOutlined />Grupos de Productos</Space>,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={10}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Jerarquía">
                    {gruposFlat.length > 0 ? (
                      <Tree
                        treeData={gruposFlat}
                        defaultExpandAll
                        blockNode
                        showIcon
                        icon={<FolderOutlined />}
                        style={{ fontSize: 13 }}
                      />
                    ) : (
                      <Text type="secondary">Sin grupos. Crea el primero.</Text>
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={14}>
                  <Card bordered={false} style={{ borderRadius: 12 }} title="Lista de Grupos">
                    <Table
                      dataSource={allGrupos}
                      rowKey="id"
                      size="small"
        scroll={{ x: 'max-content' }}
                      pagination={{ pageSize: 15 }}
                      columns={[
                        { title: 'Código', dataIndex: 'codigo', key: 'c', render: v => <Tag style={{ fontFamily: 'mono' }}>{v}</Tag> },
                        { title: 'Nombre', dataIndex: 'nombre', key: 'n', render: (v, r: any) => (
                          <div>
                            <Text strong>{v}</Text>
                            {r.parentId && <div><Text type="secondary" style={{ fontSize: 11 }}>Subcategoría</Text></div>}
                          </div>
                        )},
                        {
                          title: '', key: 'a',
                          render: (_, r: any) => (
                            <Space>
                              <Button size="small" icon={<EditOutlined />} onClick={() => abrirGrupo(r)} />
                              <Popconfirm title="¿Eliminar?" onConfirm={() => delGrupo.mutate(r.id)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'clientes',
            label: <Space><TeamOutlined />Segmentos de Clientes</Space>,
            children: (
              <Card bordered={false} style={{ borderRadius: 12 }}>
                <Table
                  dataSource={segmentos}
                  rowKey="id"
                  size="middle"
                  pagination={{ pageSize: 15 }}
                  columns={[
                    { title: 'Código', dataIndex: 'codigo', key: 'c', render: v => <Tag>{v}</Tag> },
                    { title: 'Segmento', dataIndex: 'nombre', key: 'n', render: v => <Text strong>{v}</Text> },
                    { title: 'Descripción', dataIndex: 'descripcion', key: 'd', render: v => <Text type="secondary">{v ?? '—'}</Text> },
                    { title: 'Descuento %', dataIndex: 'descuentoPct', key: 'dp', render: v => v > 0 ? <Tag color="green">{v}%</Tag> : <Text type="secondary">—</Text> },
                    { title: 'Días Crédito', dataIndex: 'diasCreditoDefault', key: 'dc', render: v => <Tag>{v} días</Tag> },
                    {
                      title: '', key: 'a',
                      render: (_, r: any) => (
                        <Space>
                          <Button size="small" icon={<EditOutlined />} onClick={() => abrirSeg(r)} />
                          <Popconfirm title="¿Eliminar?" onConfirm={() => delSegment.mutate(r.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Modal Grupo */}
      <Modal
        title={editando && tipo === 'grupo' ? 'Editar Grupo' : 'Nuevo Grupo de Producto'}
        open={modalVisible && tipo === 'grupo'}
        onCancel={() => { setModalVisible(false); formG.resetFields(); }}
        onOk={() => formG.submit()}
        confirmLoading={mutGrupo.isPending}
        destroyOnClose
      >
        <Form form={formG} layout="vertical" onFinish={v => mutGrupo.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="EL" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Electrónica" /></Form.Item></Col>
          </Row>
          <Form.Item name="parentId" label="Grupo Padre (opcional)">
            <Select allowClear placeholder="Sin padre = categoría raíz">
              {allGrupos.map((g: any) => <Option key={g.id} value={g.id}>{g.codigo} — {g.nombre}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal Segmento */}
      <Modal
        title={editando && tipo === 'segmento' ? 'Editar Segmento' : 'Nuevo Segmento de Cliente'}
        open={modalVisible && tipo === 'segmento'}
        onCancel={() => { setModalVisible(false); formS.resetFields(); }}
        onOk={() => formS.submit()}
        confirmLoading={mutSegmento.isPending}
        destroyOnClose
      >
        <Form form={formS} layout="vertical"
          initialValues={{ descuentoPct: 0, diasCreditoDefault: 30 }}
          onFinish={v => mutSegmento.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="VIP" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Cliente VIP" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="descuentoPct" label="Descuento Automático (%)"><InputNumber min={0} max={100} style={{ width: '100%' }} addonAfter="%" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="diasCreditoDefault" label="Días de Crédito"><InputNumber min={0} style={{ width: '100%' }} addonAfter="días" /></Form.Item></Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
