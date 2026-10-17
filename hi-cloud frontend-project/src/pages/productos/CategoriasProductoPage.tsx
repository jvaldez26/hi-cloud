import { useState } from 'react';
import {
  Card, Table, Button, Tag, Modal, Form, Input, Select, Space, Typography,
  message, Empty, Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, MergeCellsOutlined, StopOutlined, CheckOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriasProductoApi, type CategoriaProducto } from '../../api/categoriasProducto.api';
import { useAuthStore } from '../../store/auth.store';
import { mensajeDeError } from '../../utils/mensajeDeError';

const { Title, Text } = Typography;

/**
 * Catálogo de categorías de producto — "Inventario & Logística → Categorías".
 * Reemplaza el texto libre que tenía Producto.categoria (ver categorias-
 * producto.service.ts en el backend). Crear/editar/desactivar/fusionar es
 * solo ADMIN/CONTADOR; el resto solo puede VER el catálogo.
 */
export default function CategoriasProductoPage() {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const esAdmin = user?.role === 'admin' || user?.role === 'contador';

  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ['categorias-producto', incluirInactivas],
    queryFn:  () => categoriasProductoApi.listar(incluirInactivas),
  });

  // ── Crear / editar ─────────────────────────────────────────────────────────
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<CategoriaProducto | null>(null);
  const [form] = Form.useForm();

  const guardarMut = useMutation({
    mutationFn: (vals: any) => editando
      ? categoriasProductoApi.actualizar(editando.id, vals)
      : categoriasProductoApi.crear(vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categorias-producto'] });
      message.success(editando ? 'Categoría actualizada' : 'Categoría creada');
      setModalAbierto(false); setEditando(null); form.resetFields();
    },
    onError: (e: any) => message.error(mensajeDeError(e, { fallback: 'No se pudo guardar la categoría' })),
  });

  const abrirCrear = () => { setEditando(null); form.resetFields(); setModalAbierto(true); };
  const abrirEditar = (c: CategoriaProducto) => {
    setEditando(c);
    form.setFieldsValue({ nombre: c.nombre, descripcion: c.descripcion ?? undefined, categoriaPadreId: c.categoriaPadreId ?? undefined });
    setModalAbierto(true);
  };

  // ── Desactivar / activar ────────────────────────────────────────────────────
  const desactivarMut = useMutation({
    mutationFn: categoriasProductoApi.desactivar,
    onSuccess: ({ categoria, productosAfectados }: any) => {
      qc.invalidateQueries({ queryKey: ['categorias-producto'] });
      message.success(
        productosAfectados > 0
          ? `"${categoria.nombre}" desactivada — ${productosAfectados} producto(s) la conservan, puedes editarlos o fusionar esta categoría.`
          : `"${categoria.nombre}" desactivada.`,
      );
    },
    onError: (e: any) => message.error(mensajeDeError(e, { fallback: 'No se pudo desactivar' })),
  });
  const activarMut = useMutation({
    mutationFn: categoriasProductoApi.activar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categorias-producto'] }); message.success('Categoría reactivada'); },
    onError: (e: any) => message.error(mensajeDeError(e, { fallback: 'No se pudo reactivar' })),
  });

  // ── Fusionar ─────────────────────────────────────────────────────────────────
  const [fusionando, setFusionando] = useState<CategoriaProducto | null>(null);
  const [destinoFusion, setDestinoFusion] = useState<number | undefined>();
  const fusionarMut = useMutation({
    mutationFn: () => categoriasProductoApi.fusionar(fusionando!.id, destinoFusion!),
    onSuccess: ({ productosReasignados, subcategoriasReasignadas }: any) => {
      qc.invalidateQueries({ queryKey: ['categorias-producto'] });
      message.success(
        `Fusionada — ${productosReasignados} producto(s)` +
        (subcategoriasReasignadas > 0 ? ` y ${subcategoriasReasignadas} subcategoría(s)` : '') +
        ' reasignados.',
      );
      setFusionando(null); setDestinoFusion(undefined);
    },
    onError: (e: any) => message.error(mensajeDeError(e, { fallback: 'No se pudo fusionar' })),
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Categorías de Producto</Title>
          <Text type="secondary">Catálogo real — reemplaza el texto libre que antes escribía cada quien a su manera.</Text>
        </div>
        {esAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrear}>Nueva categoría</Button>
        )}
      </div>

      <Card>
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" type={incluirInactivas ? 'default' : 'primary'} onClick={() => setIncluirInactivas(false)}>Activas</Button>
          <Button size="small" type={incluirInactivas ? 'primary' : 'default'} onClick={() => setIncluirInactivas(true)}>Todas</Button>
        </Space>

        <Table<CategoriaProducto>
          rowKey="id"
          dataSource={categorias}
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="Sin categorías todavía" /> }}
          tableLayout="fixed"
          columns={[
            { title: 'Categoría', dataIndex: 'ruta', key: 'ruta', width: 280,
              render: (ruta: string, c) => <Text strong={c.isActive}>{ruta}</Text> },
            { title: 'Descripción', dataIndex: 'descripcion', key: 'descripcion', width: 320, ellipsis: true,
              render: (v?: string | null) => v || <Text type="secondary">—</Text> },
            { title: 'Estado', dataIndex: 'isActive', key: 'estado', width: 110,
              render: (v: boolean) => v ? <Tag color="green">Activa</Tag> : <Tag>Inactiva</Tag> },
            { title: '', key: 'acciones', width: 220,
              render: (_: unknown, c) => esAdmin ? (
                <Space size="small">
                  <Button size="small" icon={<EditOutlined />} onClick={() => abrirEditar(c)}>Editar</Button>
                  {c.isActive ? (
                    <>
                      <Button size="small" icon={<MergeCellsOutlined />} onClick={() => { setFusionando(c); setDestinoFusion(undefined); }}>
                        Fusionar
                      </Button>
                      <Popconfirm title="¿Desactivar esta categoría?" description="No se borra — los productos que la tenían la conservan." onConfirm={() => desactivarMut.mutate(c.id)}>
                        <Button size="small" danger icon={<StopOutlined />} loading={desactivarMut.isPending} />
                      </Popconfirm>
                    </>
                  ) : (
                    <Button size="small" icon={<CheckOutlined />} onClick={() => activarMut.mutate(c.id)} loading={activarMut.isPending}>
                      Reactivar
                    </Button>
                  )}
                </Space>
              ) : null },
          ]}
        />
      </Card>

      {/* Crear / editar */}
      <Modal
        title={editando ? 'Editar categoría' : 'Nueva categoría'}
        open={modalAbierto}
        onCancel={() => { setModalAbierto(false); setEditando(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={guardarMut.isPending}
        okText={editando ? 'Guardar' : 'Crear'}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={vals => guardarMut.mutate(vals)}>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true, message: 'Obligatorio' }]}>
            <Input autoFocus maxLength={100} placeholder="Ej. Lácteos" />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción (opcional)">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Form.Item name="categoriaPadreId" label="Categoría padre (opcional — crea una subcategoría)">
            <Select allowClear placeholder="Ninguna — categoría de nivel superior"
              options={categorias.filter(c => !c.categoriaPadreId && c.id !== editando?.id).map(c => ({ value: c.id, label: c.nombre }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Fusionar */}
      <Modal
        title={`Fusionar "${fusionando?.nombre ?? ''}"`}
        open={!!fusionando}
        onCancel={() => { setFusionando(null); setDestinoFusion(undefined); }}
        onOk={() => fusionarMut.mutate()}
        okButtonProps={{ disabled: !destinoFusion, loading: fusionarMut.isPending }}
        okText="Fusionar"
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Todos los productos (y subcategorías) de &ldquo;{fusionando?.nombre}&rdquo; pasan a la categoría que elijas abajo,
          y &ldquo;{fusionando?.nombre}&rdquo; queda desactivada. No se puede deshacer.
        </Text>
        <Select
          style={{ width: '100%' }}
          placeholder="Fusionar dentro de..."
          showSearch
          optionFilterProp="label"
          value={destinoFusion}
          onChange={setDestinoFusion}
          options={categorias.filter(c => c.isActive && c.id !== fusionando?.id).map(c => ({ value: c.id, label: c.ruta }))}
        />
      </Modal>
    </div>
  );
}
