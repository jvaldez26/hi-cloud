import { useState } from 'react';
import { Button, Modal, Form, Select, Input, InputNumber, message, Tag, Row, Col, Card, Empty, Dropdown, Popconfirm } from 'antd';
import { ShoppingCartOutlined, PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

const CATEGORIAS = ['Suplementos', 'Ropa', 'Equipos', 'Accesorios', 'Bebidas', 'Snacks', 'Otros'];

export default function TiendaPage() {
  const [modalProducto, setModalProducto] = useState(false);
  const [modalVenta,    setModalVenta]    = useState(false);
  const [editando,      setEditando]      = useState<any>(null);
  const [productoSel,   setProductoSel]   = useState<any>(null);
  const [formProd]  = Form.useForm();
  const [formVenta] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-tienda'],
    queryFn:  gimnasioApi.getTienda,
  });
  const productos: any[] = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({
    queryKey: ['gimnasio-miembros-sel'],
    queryFn:  () => gimnasioApi.getMiembros({ limit: 500 }),
  });
  const miembros: any[] = Array.isArray(miembrosData) ? miembrosData : (miembrosData as any)?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['gimnasio-tienda'] });

  const crearMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.createProductoTienda(body),
    onSuccess:  () => { invalidate(); message.success('Producto creado'); setModalProducto(false); formProd.resetFields(); setEditando(null); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => gimnasioApi.updateProductoTienda(id, body),
    onSuccess:  () => { invalidate(); message.success('Producto actualizado'); setModalProducto(false); formProd.resetFields(); setEditando(null); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => gimnasioApi.deleteProductoTienda(id),
    onSuccess:  () => { invalidate(); message.success('Producto eliminado'); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const ventaMut = useMutation({
    mutationFn: (body: any) => gimnasioApi.ventaTienda(body),
    onSuccess:  () => { invalidate(); message.success('Venta registrada'); setModalVenta(false); formVenta.resetFields(); setProductoSel(null); },
    onError:    (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const openCrear = () => {
    setEditando(null);
    formProd.resetFields();
    setModalProducto(true);
  };

  const openEditar = (p: any) => {
    setEditando(p);
    formProd.setFieldsValue({ nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, precio: p.precio, stock: p.stock });
    setModalProducto(true);
  };

  const handleOkProducto = () => {
    formProd.validateFields().then(v => {
      if (editando) {
        editarMut.mutate({ id: editando.id, body: v });
      } else {
        crearMut.mutate(v);
      }
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Tienda del Gimnasio</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCrear}>Nuevo Producto</Button>
      </div>

      {!isLoading && productos.length === 0 && (
        <Empty
          description={<span>No hay productos en la tienda.<br />Agrega el primer producto con el botón "Nuevo Producto".</span>}
          style={{ padding: 60 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {productos.map((p: any) => (
          <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              size="small"
              extra={
                <Dropdown
                  menu={{
                    items: [
                      { key: 'editar', label: 'Editar', icon: <EditOutlined />, onClick: () => openEditar(p) },
                      { key: 'div', type: 'divider' },
                      { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
                        onClick: () => eliminarMut.mutate(p.id) },
                    ],
                  }}
                  trigger={['click']}
                >
                  <Button type="text" size="small" icon={<MoreOutlined />} />
                </Dropdown>
              }
              actions={[
                <Button
                  key="vender"
                  icon={<ShoppingCartOutlined />}
                  type="primary"
                  size="small"
                  disabled={p.stock <= 0}
                  onClick={() => { setProductoSel(p); formVenta.resetFields(); setModalVenta(true); }}
                >
                  Vender
                </Button>,
              ]}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.nombre}</div>
              {p.categoria && <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{p.categoria}</div>}
              {p.descripcion && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{p.descripcion}</div>}
              <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>
                RD${Number(p.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
              <Tag color={p.stock > 5 ? 'green' : p.stock > 0 ? 'orange' : 'red'}>
                Stock: {p.stock}
              </Tag>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Modal crear / editar producto */}
      <Modal
        open={modalProducto}
        title={editando ? `Editar: ${editando.nombre}` : 'Nuevo Producto'}
        onCancel={() => { setModalProducto(false); formProd.resetFields(); setEditando(null); }}
        onOk={handleOkProducto}
        confirmLoading={crearMut.isPending || editarMut.isPending}
        okText={editando ? 'Guardar' : 'Crear'}
        destroyOnClose
      >
        <Form form={formProd} layout="vertical">
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: 'Requerido' }]}>
            <Input placeholder="Ej: Proteína Whey 1kg" />
          </Form.Item>
          <Form.Item name="categoria" label="Categoría">
            <Select placeholder="Seleccionar categoría" allowClear>
              {CATEGORIAS.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="precio" label="Precio (RD$)" rules={[{ required: true, message: 'Requerido' }]} initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} step={50} />
          </Form.Item>
          <Form.Item name="stock" label="Stock inicial" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal venta */}
      <Modal
        open={modalVenta}
        title={`Vender: ${productoSel?.nombre ?? ''}`}
        onCancel={() => { setModalVenta(false); formVenta.resetFields(); setProductoSel(null); }}
        onOk={() => formVenta.validateFields().then(v => ventaMut.mutate({ items: [{ productoId: productoSel?.id, cantidad: v.cantidad }], miembroId: v.miembroId }))}
        confirmLoading={ventaMut.isPending}
        destroyOnClose
      >
        <Form form={formVenta} layout="vertical">
          <Form.Item name="miembroId" label="Miembro (opcional)">
            <Select showSearch optionFilterProp="children" placeholder="Seleccionar miembro" allowClear>
              {miembros.map((m: any) => (
                <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]} initialValue={1}>
            <InputNumber style={{ width: '100%' }} min={1} max={productoSel?.stock ?? 999} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
