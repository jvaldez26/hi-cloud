import { useState, useMemo, useEffect } from 'react';
import { TableActions } from '../../components/ui/TableActions';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Statistic, Popconfirm,
  message, Divider, theme, Alert,
} from 'antd';
import {
  RollbackOutlined, PlusOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, EyeOutlined, FileExcelOutlined, SearchOutlined, ImportOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

const MOTIVOS = [
  { value: 'devolucion',   label: 'Devolución de mercancía' },
  { value: 'defecto',      label: 'Mercancía defectuosa' },
  { value: 'descuento',    label: 'Descuento otorgado por proveedor' },
  { value: 'error_precio', label: 'Error en precio facturado' },
  { value: 'otro',         label: 'Otro motivo' },
];

/** Tipo de efecto — decide si la NC toca inventario, contra qué se valida
 *  la cantidad, y qué cuenta acredita el asiento (ver notas-credito-compras
 *  .service.ts en el backend). No es lo mismo que `motivo`: motivo describe
 *  POR QUÉ, tipo describe QUÉ PASA con inventario y contabilidad. */
const TIPOS_NC = [
  {
    value: 'devolucion_inventario',
    label: 'Devolución con reversa de inventario',
    ayuda: 'La mercancía SÍ entró y SÍ se devuelve físicamente. Selecciona la OC y carga sus ítems — la cantidad no puede exceder lo que esa línea recibió.',
  },
  {
    value: 'ajuste_sin_devolucion',
    label: 'Ajuste sin devolución física',
    ayuda: 'Descuento, error de precio o mercancía dañada que NO se devuelve. No toca inventario — solo el monto del ajuste, sin cantidad.',
  },
  {
    value: 'no_recibida',
    label: 'Mercancía no recibida',
    ayuda: 'La OC/factura incluía algo que nunca llegó a entrar. No toca inventario (nunca hubo entrada). La cantidad no puede exceder lo pendiente de recibir de esa línea.',
  },
] as const;

const ayudaTipo = (tipo?: string) => TIPOS_NC.find(t => t.value === tipo)?.ayuda ?? '';

const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador: { color: 'default', label: 'Borrador' },
  recibida: { color: 'green',   label: 'Confirmada' },
  anulada:  { color: 'red',     label: 'Anulada'   },
};

const COLS_DEF = [
  { key: 'n',   label: 'Número',      defaultVisible: true  },
  { key: 'f',   label: 'Fecha',       defaultVisible: true  },
  { key: 'p',   label: 'Proveedor',   defaultVisible: true  },
  { key: 'ti',  label: 'Tipo',        defaultVisible: true  },
  { key: 'm',   label: 'Motivo',      defaultVisible: false },
  { key: 'cof', label: 'Compra ref.', defaultVisible: false },
  { key: 't',   label: 'Total',       defaultVisible: true  },
  { key: 'e',   label: 'Estado',      defaultVisible: true  },
];

export default function NotasCreditoComprasPage() {
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('notas-credito-compras', COLS_DEF);
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search,       setSearch]       = useState('');
  const [modalCrear,   setModalCrear]   = useState(false);
  const [modalDetalle, setModalDetalle] = useState<any>(null);
  const [formCrear] = Form.useForm();

  const { data: proveedores = [] } = useQuery<any[]>({
    queryKey: ['proveedores-select'],
    queryFn:  () => api.get('/proveedores?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn:  () => api.get('/productos?limit=5000&incluirSinStock=true').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    refetchOnWindowFocus: true,
  });

  // ── Vínculo con la OC original ──────────────────────────────────────────
  // El tipo y el proveedor deciden qué OC's tiene sentido ofrecer: sin
  // proveedor elegido, no hay nada que buscar.
  const tipoWatch      = Form.useWatch('tipo', formCrear);
  const motivoWatch    = Form.useWatch('motivo', formCrear);
  const proveedorWatch = Form.useWatch('proveedorId', formCrear);
  const compraIdWatch  = Form.useWatch('compraOriginalId', formCrear);
  const requiereOC     = tipoWatch !== 'ajuste_sin_devolucion';

  const { data: comprasProveedor = [] } = useQuery<any[]>({
    queryKey: ['compras-por-proveedor', proveedorWatch],
    queryFn:  () => api.get(`/compras?proveedorId=${proveedorWatch}&limit=100`)
      .then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
    enabled: !!proveedorWatch,
  });

  const { data: compraSeleccionada } = useQuery<any>({
    queryKey: ['compra-detalle', compraIdWatch],
    queryFn:  () => api.get(`/compras/${compraIdWatch}`).then((r: any) => r.data?.data ?? r.data),
    enabled: !!compraIdWatch,
  });

  // Tope de cantidad por línea de la OC, según el tipo — la única razón de
  // ser de compraDetalleId en cada renglón de "Ítems a devolver".
  const topesPorLinea = useMemo(() => {
    const mapa = new Map<number, { max: number; label: string }>();
    for (const d of compraSeleccionada?.detalles ?? []) {
      const cantidadTotal    = Number(d.cantidadTotal ?? d.cantidad ?? 0);
      const cantidadRecibida = Number(d.cantidadRecibida ?? 0);
      const max = tipoWatch === 'no_recibida'
        ? +(cantidadTotal - cantidadRecibida).toFixed(4)
        : cantidadRecibida; // devolucion_inventario
      mapa.set(d.id, { max, label: tipoWatch === 'no_recibida' ? 'pendiente de recibir' : 'recibido' });
    }
    return mapa;
  }, [compraSeleccionada, tipoWatch]);

  // Cambiar el tipo invalida la OC elegida y las líneas ya cargadas: los
  // topes de "recibido" y "pendiente" son distintos entre devolución y no
  // recibida, y un ajuste sin devolución no debería arrastrar ítems
  // vinculados a una OC. Mejor limpiar que dejar una validación mentirosa.
  useEffect(() => {
    formCrear.setFieldsValue({ compraOriginalId: undefined, compraOriginalFolio: undefined });
    const vacio = [{}];
    formCrear.setFieldsValue({ detalles: vacio });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoWatch]);

  const cargarItemsDeLaOC = () => {
    if (!compraSeleccionada) return;
    const detalles = (compraSeleccionada.detalles ?? [])
      .map((d: any) => {
        const tope = topesPorLinea.get(d.id);
        const cantidad = tope?.max ?? 0;
        return cantidad > 0 ? {
          compraDetalleId: d.id,
          productoId:      d.productoId,
          descripcion:     d.producto?.nombre ?? d.descripcion,
          cantidad,
          precioUnitario:  Number(d.precioUnitario ?? 0),
        } : null;
      })
      .filter(Boolean);
    if (detalles.length === 0) {
      message.warning(tipoWatch === 'no_recibida'
        ? 'Esa OC no tiene nada pendiente de recibir'
        : 'Esa OC no tiene nada recibido para devolver');
      return;
    }
    formCrear.setFieldsValue({ detalles });
  };

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['ncc-resumen'],
    queryFn:  () => api.get('/notas-credito-compras/resumen').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: notas, isLoading } = useQuery<any>({
    queryKey: ['notas-credito-compras'],
    queryFn:  () => api.get('/notas-credito-compras?limit=50').then((r: any) => r.data?.data ?? r.data),
  });

  const notasFiltradas = useMemo(() => {
    const lista = notas?.data ?? [];
    if (!search.trim()) return lista;
    const q = search.toLowerCase();
    return lista.filter((n: any) =>
      (n.numero ?? '').toLowerCase().includes(q) ||
      (n.proveedor?.nombre ?? '').toLowerCase().includes(q)
    );
  }, [notas, search]);

  const errMsg = (e: any) =>
    e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado';

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/notas-credito-compras', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      setModalCrear(false); formCrear.resetFields();
      message.success('Nota de crédito creada');
    },
    onError: (e: any) => message.error(`Error al crear NC: ${errMsg(e)}`, 6),
  });

  const recibir = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito-compras/${id}/recibir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC confirmada — inventario actualizado');
    },
    onError: (e: any) => message.error(`Error al confirmar NC: ${errMsg(e)}`, 6),
  });

  const anular = useMutation({
    mutationFn: (id: number) => api.patch(`/notas-credito-compras/${id}/anular`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC anulada');
    },
    onError: (e: any) => message.error(`Error al anular NC: ${errMsg(e)}`, 6),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/notas-credito-compras/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas-credito-compras'] });
      qc.invalidateQueries({ queryKey: ['ncc-resumen'] });
      message.success('NC eliminada');
    },
    onError: (e: any) => message.error(`Error al eliminar NC: ${errMsg(e)}`, 6),
  });

  const handleCrear = (values: any) => {
    const esAjuste = values.tipo === 'ajuste_sin_devolucion';
    crear.mutate({
      ...values,
      fecha: values.fecha?.format('YYYY-MM-DD'),
      // Un ajuste sin devolución no pide cantidad (no tiene sentido físico) —
      // se fija en 1 para que subtotal = 1 × monto = monto tecleado, sin
      // tener que ramificar el cálculo de subtotal/iva en el backend.
      detalles: (values.detalles ?? []).map((d: any) => ({
        ...d,
        cantidad:       esAjuste ? 1 : Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
      })),
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RollbackOutlined style={{ fontSize: 28, color: token.colorWarning }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Notas de Crédito — Compras</Title>
            <Text type="secondary">Devoluciones y ajustes con proveedores · Reversa de inventario automática</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por número o proveedor..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (notas?.data ?? []).map((n: any) => ({
              'Número':    n.numero ?? '',
              'Fecha':     n.fecha ? dayjs(n.fecha).format('DD/MM/YYYY') : '',
              'Proveedor': n.proveedor?.nombre ?? '',
              'Motivo':    n.motivo?.replace(/_/g,' ') ?? '',
              'Total':     Number(n.total ?? 0),
              'Estado':    n.estado ?? '',
            }));
            exportarExcel(filas, `NC-Compras-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['notas-credito-compras']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nueva NC Compra
          </Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={notasFiltradas}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
          columns={filterColumns([
            { title: 'Número',    dataIndex: 'numero', key: 'n', width: 110,
              render: (v: any) => <Text strong style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v}</Text> },
            { title: 'Fecha',     dataIndex: 'fecha',  key: 'f', width: 90,
              render: (v: any) => <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{String(v).split('T')[0]}</span> },
            { title: 'Proveedor', key: 'p', ellipsis: true, minWidth: 130,
              render: (_: any, r: any) => <Text strong ellipsis>{r.proveedor?.nombre}</Text> },
            { title: 'Tipo',      dataIndex: 'tipo', key: 'ti', width: 160,
              render: (v: any) => <Tag color="geekblue" style={{ whiteSpace: 'normal' }}>{TIPOS_NC.find(t => t.value === v)?.label ?? 'Devolución con reversa de inventario'}</Tag> },
            { title: 'Motivo',    dataIndex: 'motivo', key: 'm', width: 130,
              render: (v: any) => <Tag style={{ whiteSpace: 'nowrap' }}>{MOTIVOS.find((x: any) => x.value === v)?.label ?? v}</Tag> },
            { title: 'Compra ref.', dataIndex: 'compraOriginalFolio', key: 'cof', width: 150,
              render: (v: any) => v ? <Tag color="blue" style={{ whiteSpace: 'nowrap' }}>{v}</Tag> : '—' },
            { title: 'Total',  dataIndex: 'total', key: 't', align: 'right' as const, width: 110,
              render: (v: any) => <Text strong style={{ color: token.colorWarning, whiteSpace: 'nowrap' }}>{fmt(v)}</Text> },
            { title: 'Estado', dataIndex: 'estado', key: 'e', width: 100,
              render: (v: any) => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag> },
            {
              title: '', key: 'acc', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setModalDetalle(r)}
                  viewLabel="Ver detalle"
                  items={[
                    r.estado === 'borrador' ? {
                      key: 'confirmar',
                      label: 'Confirmar NC',
                      onClick: () => recibir.mutate(r.id),
                    } : null,
                    r.estado === 'recibida' ? {
                      key: 'anular',
                      label: 'Anular',
                      danger: true,
                      onClick: () => anular.mutate(r.id),
                    } : null,
                    r.estado === 'borrador' ? {
                      key: 'eliminar',
                      label: 'Eliminar',
                      danger: true,
                      onClick: () => eliminar.mutate(r.id),
                    } : null,
                  ].filter(Boolean)}
                />
              ),
            },
          ] as any)}
        />
      </Card>

      {/* Modal Crear */}
      <Modal
        title={<Space><RollbackOutlined />Nueva NC de Compra — Devolución a Proveedor</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear en Borrador"
        width={700}
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical" onFinish={handleCrear}
          initialValues={{ fecha: dayjs(), tipo: 'devolucion_inventario', detalles: [{}] }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="tipo" label="Tipo de NC" rules={[{ required: true }]}>
                <Select>
                  {TIPOS_NC.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="ncfProveedor" label="NCF del proveedor (su E34/B04)" rules={[{ required: true, message: 'Requerido para el 606' }]}>
                <Input placeholder="E340000001234 o B0400000123" />
              </Form.Item>
            </Col>
          </Row>
          {ayudaTipo(tipoWatch) && (
            <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }} message={ayudaTipo(tipoWatch)} />
          )}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="proveedorId" label="Proveedor" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children">
                  {proveedores.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="compraOriginalId" label="OC Original"
                rules={[{ required: requiereOC, message: 'Requerida para validar cantidad' }]}>
                <Select
                  showSearch optionFilterProp="children" allowClear
                  disabled={!proveedorWatch}
                  placeholder={proveedorWatch ? 'Buscar OC...' : 'Elige un proveedor primero'}
                  onChange={(id) => {
                    const c = comprasProveedor.find((x: any) => x.id === id);
                    formCrear.setFieldsValue({ compraOriginalFolio: c?.folio });
                  }}
                >
                  {comprasProveedor.map((c: any) => (
                    <Option key={c.id} value={c.id}>{c.folio} — {fmt(Number(c.total ?? 0))}</Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="compraOriginalFolio" hidden><Input /></Form.Item>
            </Col>
          </Row>
          {compraIdWatch && requiereOC && (
            <Button size="small" icon={<ImportOutlined />} onClick={cargarItemsDeLaOC} style={{ marginBottom: 12 }}>
              Cargar ítems de la OC ({tipoWatch === 'no_recibida' ? 'lo pendiente' : 'lo recibido'})
            </Button>
          )}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="motivo" label="Motivo" rules={[{ required: true }]}>
                <Select>
                  {MOTIVOS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="descripcionMotivo" label="Descripción"
                rules={motivoWatch === 'otro' ? [{ required: true, message: 'Describe el motivo cuando eliges "Otro"' }] : []}>
                <Input placeholder={motivoWatch === 'otro' ? 'Obligatorio con "Otro motivo"' : undefined} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" style={{ fontSize: 13 }}>
            {tipoWatch === 'ajuste_sin_devolucion' ? 'Ítems del ajuste' : 'Ítems a devolver'}
          </Divider>
          <Form.List name="detalles">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => {
                  const compraDetalleId = formCrear.getFieldValue(['detalles', name, 'compraDetalleId']);
                  const tope = compraDetalleId ? topesPorLinea.get(compraDetalleId) : undefined;
                  return (
                  <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={tipoWatch === 'ajuste_sin_devolucion' ? 9 : 8}>
                      <Form.Item name={[name, 'productoId']} noStyle>
                        <Select showSearch optionFilterProp="children" placeholder="Producto" allowClear style={{ width: '100%' }}
                          onChange={pid => {
                            const p = productos.find((x: any) => x.id === pid);
                            if (p) { const ds = formCrear.getFieldValue('detalles'); ds[name] = { ...ds[name], descripcion: p.nombre, precioUnitario: p.precio }; formCrear.setFieldsValue({ detalles: ds }); }
                          }}>
                          {productos.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={tipoWatch === 'ajuste_sin_devolucion' ? 9 : 7}>
                      <Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true }]}><Input placeholder="Descripción *" /></Form.Item>
                    </Col>
                    {tipoWatch !== 'ajuste_sin_devolucion' && (
                      <Col xs={12} sm={4}>
                        <Form.Item name={[name, 'cantidad']} noStyle
                          rules={[
                            { required: true, message: 'Cant.' },
                            ...(tope ? [{
                              validator: async (_: any, v: number) => {
                                if (v != null && v > tope.max) {
                                  throw new Error(`Máx ${tope.max} (${tope.label})`);
                                }
                              },
                            }] : []),
                          ]}
                        >
                          <InputNumber min={0.0001} max={tope?.max} placeholder="Cant." style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    )}
                    <Col xs={12} sm={tipoWatch === 'ajuste_sin_devolucion' ? 5 : 4}>
                      <Form.Item name={[name, 'precioUnitario']} noStyle rules={[{ required: true }]}>
                        <InputNumber min={0} placeholder={tipoWatch === 'ajuste_sin_devolucion' ? 'Monto' : 'Precio'} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Form.Item name={[name, 'compraDetalleId']} hidden><InputNumber /></Form.Item>
                    <Col xs={12} sm={1}>{fields.length > 1 && <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />}</Col>
                  </Row>
                  );
                })}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Agregar ítem</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal title={`NC ${modalDetalle?.numero}`} open={!!modalDetalle} onCancel={() => setModalDetalle(null)} footer={null} width={580} destroyOnClose>
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12}><Text type="secondary" style={{ fontSize: 11 }}>Proveedor</Text><div><Text strong>{modalDetalle.proveedor?.nombre}</Text></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Estado</Text><div><Tag color={ESTADO_CONFIG[modalDetalle.estado]?.color}>{ESTADO_CONFIG[modalDetalle.estado]?.label}</Tag></div></Col>
              <Col xs={12} sm={6}><Text type="secondary" style={{ fontSize: 11 }}>NCF del proveedor</Text><div><Text strong style={{ fontFamily: 'monospace' }}>{modalDetalle.ncfProveedor || '—'}</Text></div></Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24}><Tag color="geekblue">{TIPOS_NC.find(t => t.value === modalDetalle.tipo)?.label ?? 'Devolución con reversa de inventario'}</Tag></Col>
            </Row>
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={modalDetalle.detalles} rowKey="id" pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cant.', dataIndex: 'cantidad', key: 'c', align: 'right' },
                { title: 'Precio', dataIndex: 'precioUnitario', key: 'p', align: 'right', render: v => fmt(v) },
                { title: 'ITBIS', dataIndex: 'iva', key: 'i', align: 'right', render: v => fmt(v) },
                { title: 'Total', dataIndex: 'total', key: 't', align: 'right', render: v => <Text strong>{fmt(v)}</Text> },
              ]}
            />
            <Divider />
            <Row justify="end" gutter={16}>
              <Col><Text type="secondary">Subtotal: {fmt(modalDetalle.subtotal)}</Text></Col>
              <Col><Text type="secondary">ITBIS: {fmt(modalDetalle.iva)}</Text></Col>
              <Col><Text strong style={{ fontSize: 16, color: token.colorWarning }}>Total NC: {fmt(modalDetalle.total)}</Text></Col>
            </Row>
          </>
        )}
      </Modal>
    </div>
  );
}
