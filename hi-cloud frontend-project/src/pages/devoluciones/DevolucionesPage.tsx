import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { Table, Button, Tag, Card, Row, Col, Typography, Statistic, Space,
         Modal, Form, Input, Select, InputNumber, DatePicker, message,
         Drawer, Descriptions, Alert, Tooltip } from 'antd';
import { PlusOutlined, CheckOutlined, FileExcelOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

type EstadoDev = 'pendiente' | 'procesada' | 'anulada';

const estadoColor: Record<EstadoDev, string> = {
  pendiente: 'orange', procesada: 'green', anulada: 'red',
};

const devolucionesApi = {
  list:    (p = 1, limit = 10, search?: string) =>
    api.get(`/devoluciones?page=${p}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then(r => r.data?.data ?? r.data),
  getOne:  (id: number)        => api.get(`/devoluciones/${id}`).then(r => r.data?.data ?? r.data),
  resumen: ()                  => api.get('/devoluciones/resumen').then(r => r.data?.data ?? r.data),
  create:  (body: any)         => api.post('/devoluciones', body).then(r => r.data?.data ?? r.data),
  procesar:(id: number, body?: { almacenId?: number; detalles?: { detalleId: number; cantidad: number }[] }) =>
    api.post(`/devoluciones/${id}/procesar`, body ?? {}).then(r => r.data?.data ?? r.data),
  anular:  (id: number)        => api.patch(`/devoluciones/${id}/anular`).then(r => r.data?.data ?? r.data),
};

const facturasApi = {
  buscar: (search: string) => api.get(`/facturas?search=${search}&limit=10`).then(r => r.data?.data ?? r.data),
  getOne: (id: number)     => api.get(`/facturas/${id}`).then(r => r.data?.data ?? r.data),
};

const almacenesApi = {
  list: () => api.get('/almacenes?limit=200').then((r: any) => {
    const d = r.data?.data ?? r.data;
    return Array.isArray(d) ? d : (d?.data ?? []);
  }),
};

export default function DevolucionesPage() {
  const [page,   setPage]   = useState(1);
  const [open,   setOpen]   = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [form]              = Form.useForm();
  const [facturaSelId, setFacturaSelId] = useState<number | null>(null);
  const [lineas, setLineas] = useState<any[]>([]);
  const [facturaOptions, setFacturaOptions] = useState<{ value: number; label: string }[]>([]);
  const [buscandoFacturas, setBuscandoFacturas] = useState(false);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  // Confirmar recepción — reemplaza el antiguo Modal.confirm: aquí se elige
  // el almacén de entrada y, si el cliente devolvió menos de lo solicitado,
  // se ajusta la cantidad por línea. El movimiento de inventario ocurre acá,
  // no al crear la devolución.
  const [recepcion, setRecepcion] = useState<any>(null);
  const [cargandoRecepcion, setCargandoRecepcion] = useState<number | null>(null);
  const [formRecepcion] = Form.useForm();
  const [cantidadesRecepcion, setCantidadesRecepcion] = useState<Record<number, number>>({});
  const { data: almacenes = [] } = useQuery<any[]>({ queryKey: ['almacenes-sel'], queryFn: almacenesApi.list });

  /**
   * Llega desde "⇄ devolución" en Notas de Crédito — mismo patrón que
   * ?numero= allá: precarga el buscador con el número exacto y se borra al
   * usarse, para que recargar la pantalla no lo vuelva a aplicar.
   */
  const [params, setParams] = useSearchParams();
  const precargado = useRef(false);
  useEffect(() => {
    const numero = params.get('numero');
    if (!numero || precargado.current) return;
    precargado.current = true;
    setSearch(numero);
    params.delete('numero');
    setParams(params, { replace: true });
  }, [params]);

  const { data, isLoading } = useQuery({
    queryKey: ['devoluciones', page, search],
    queryFn:  () => devolucionesApi.list(page, 10, search || undefined),
  });

  const { data: facturaDetalle } = useQuery({
    queryKey: ['factura-detalle', facturaSelId],
    queryFn: () => facturasApi.getOne(facturaSelId!),
    enabled: !!facturaSelId,
  });

  const createMut = useMutation({
    mutationFn: devolucionesApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devoluciones'] }); setOpen(false); form.resetFields(); setLineas([]); setFacturaSelId(null); message.success('Devolución registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const procesarMut = useMutation({
    mutationFn: (vars: { id: number; almacenId?: number; detalles?: { detalleId: number; cantidad: number }[] }) =>
      devolucionesApi.procesar(vars.id, { almacenId: vars.almacenId, detalles: vars.detalles }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['devoluciones'] });
      setRecepcion(null); setCantidadesRecepcion({}); formRecepcion.resetFields();
      const ncNumero = res?.notaCreditoNumero ?? res?.data?.notaCreditoNumero;
      message.success(
        ncNumero
          ? `✅ Devolución procesada. Nota de Crédito E34 ${ncNumero} generada automáticamente.`
          : 'Devolución procesada: inventario actualizado',
        5,
      );
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const anularMut = useMutation({
    mutationFn: devolucionesApi.anular,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devoluciones'] }); message.success('Devolución anulada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al anular devolución'),
  });

  const onFacturaChange = (id: number) => {
    setFacturaSelId(id);
    const detalles = facturaDetalle?.detalles ?? [];
    setLineas(detalles.map((d: any) => ({ ...d, devolver: d.cantidad })));
  };

  /**
   * "Ver devolución" — mismo problema que abrirRecepcion() más abajo: `r`
   * viene de la fila de la tabla (findAll(), sin detalles). Abre el drawer
   * de una vez con lo que ya hay (nada de espera visible) y lo reemplaza en
   * cuanto llega el registro completo — así el drawer nunca queda vacío ni
   * bloqueado esperando la red.
   */
  const abrirDetalle = async (r: any) => {
    setDetail(r);
    try {
      const full = await devolucionesApi.getOne(r.id);
      setDetail(full);
    } catch {
      // se queda con lo que ya tenía — no vale la pena romper el drawer por esto
    }
  };

  /**
   * Abre "Confirmar recepción" precargado con la cantidad completa de cada
   * línea — el usuario solo ajusta las que de verdad devolvió menos.
   *
   * `r` llega de la fila de la TABLA (findAll(), que solo hace
   * leftJoinAndSelect de cliente/factura — nunca de detalles, aunque la
   * entidad los declare eager: eso solo aplica a find()/findOne(), no a
   * QueryBuilder). Sin volver a pedir el registro completo, el modal se
   * abría con detalles=undefined → "No hay datos".
   */
  const abrirRecepcion = async (r: any) => {
    setCargandoRecepcion(r.id);
    try {
      const full = await devolucionesApi.getOne(r.id);
      const init: Record<number, number> = {};
      for (const d of full.detalles ?? []) init[d.id] = Number(d.cantidad);
      setCantidadesRecepcion(init);
      formRecepcion.resetFields();
      setRecepcion(full);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'No se pudo cargar la devolución');
    } finally {
      setCargandoRecepcion(null);
    }
  };

  const handleSubmit = (values: any) => {
    createMut.mutate({
      facturaId: values.facturaId,
      fecha:     values.fecha.format('YYYY-MM-DD'),
      tipo:      values.tipo,
      motivo:    values.motivo,
      detalles:  lineas.filter(l => l.devolver > 0).map(l => ({
        productoId:     l.productoId,
        descripcion:    l.descripcion,
        cantidad:       l.devolver,
        precioUnitario: Number(l.precioUnitario),
        porcentajeIva:  Number(l.porcentajeIva),
      })),
    });
  };

  const COLS_DEF = [
    { key: 'numero',  label: 'Número',         defaultVisible: true  },
    { key: 'origen',  label: 'Origen',          defaultVisible: true  },
    { key: 'fecha',   label: 'Fecha',           defaultVisible: true  },
    { key: 'tipo',    label: 'Tipo',            defaultVisible: true  },
    { key: 'cli',     label: 'Cliente',         defaultVisible: true  },
    { key: 'fac',     label: 'Factura',         defaultVisible: true  },
    { key: 'total',   label: 'Total',           defaultVisible: true  },
    { key: 'estado',  label: 'Estado',          defaultVisible: true  },
    { key: 'nc',      label: 'NC E34 Generada', defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('devoluciones', COLS_DEF);

  const cols = [
    { key: 'numero',  title: 'Número',   dataIndex: 'numero',  width: 170, render: (v: string) => <code>{v}</code> },
    { key: 'origen',  title: 'Origen',   width: 190,
      render: (_: any, r: any) => {
        if (!r.generadaDesdeNc) return <Tag style={{ fontSize: 11 }}>Manual</Tag>;
        const pendienteDeRecibir = r.estado === 'pendiente';
        return (
          <Tooltip title={r.notaCreditoNumero ? `Generada desde NC ${r.notaCreditoNumero}` : 'Generada desde una Nota de Crédito'}>
            <Tag icon={pendienteDeRecibir ? <InboxOutlined /> : undefined}
              color={pendienteDeRecibir ? 'processing' : 'blue'} style={{ fontSize: 11 }}>
              {pendienteDeRecibir ? 'Desde NC — recibir mercancía' : 'Desde NC'}
            </Tag>
          </Tooltip>
        );
      } },
    { key: 'fecha',   title: 'Fecha',    dataIndex: 'fecha',   width: 100, render: (v: string) => fmt.date(v) },
    { key: 'tipo',    title: 'Tipo',     dataIndex: 'tipo',    width: 80,  render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
    { key: 'cli',     title: 'Cliente',  ellipsis: true,                   render: (_: any, r: any) => r.cliente?.nombre },
    { key: 'fac',     title: 'Factura',  width: 150,                       render: (_: any, r: any) => r.factura?.folio },
    { key: 'total',   title: 'Total',    dataIndex: 'total',   width: 120, render: (v: number) => fmt.money(v) },
    { key: 'estado',  title: 'Estado',   dataIndex: 'estado',  width: 110,
      render: (v: EstadoDev) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
    { key: 'nc',      title: 'NC E34 Generada', width: 140,
      render: (_: any, r: any) => r.notaCreditoNumero
        ? <Tag color="green" style={{ fontSize: 11 }}>✓ {r.notaCreditoNumero}</Tag>
        : r.estado === 'procesada'
          ? <Tag color="default" style={{ fontSize: 10 }}>—</Tag>
          : null,
    },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => abrirDetalle(r)}
          viewLabel="Ver devolución"
          items={[
            ...(r.estado === 'pendiente' ? [
              { key: 'procesar',
                label: cargandoRecepcion === r.id ? 'Cargando...' : 'Confirmar recepción',
                icon: <CheckOutlined />, disabled: cargandoRecepcion === r.id,
                onClick: () => abrirRecepcion(r) },
            ] : []),
            { type: 'divider' as const },
            ...(r.estado === 'pendiente' ? [
              { key: 'anular', label: 'Anular devolución', danger: true,
                onClick: () => Modal.confirm({
                  title: '¿Anular esta devolución?',
                  okText: 'Confirmar',
                  cancelText: 'Cancelar',
                  okButtonProps: { danger: true },
                  onOk: () => anularMut.mutate(r.id),
                }) },
            ] : []),
          ]}
        />
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Devoluciones</Title>

      <Card extra={
        <Space>
          <Input.Search
            placeholder="Número, cliente o factura..."
            allowClear
            style={{ width: 220 }}
            onSearch={v => { setSearch(v); setPage(1); }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (data?.data ?? []).map((d: any) => ({
              'Número':    d.numero ?? '',
              'Origen':    d.generadaDesdeNc ? 'Desde NC' : 'Manual',
              'Fecha':     d.fecha ?? '',
              'Cliente':   d.cliente?.nombre ?? '',
              'Factura':   d.facturaFolio ?? d.factura?.folio ?? '',
              'Motivo':    d.motivo?.replace(/_/g,' ') ?? '',
              'Total':     Number(d.total ?? d.montoTotal ?? 0),
              'Estado':    d.estado ?? '',
            }));
            exportarExcel(filas, 'Devoluciones');
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['devoluciones']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); setLineas([]); }}>
            Nueva devolución
          </Button>
        </Space>
      }>
        <Table columns={filterColumns(cols)} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          onRow={(r: any) => r.generadaDesdeNc && r.estado === 'pendiente'
            ? { style: { background: '#fff7e6' } } : {}}
          pagination={{ total: data?.meta?.total, pageSize: 10, current: page, onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Modal crear */}
      <Modal title="Registrar Devolución" open={open} onCancel={() => setOpen(false)} footer={null} width={760}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ fecha: dayjs(), tipo: 'total' }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="facturaId" label="Factura original" rules={[{ required: true }]}>
                <Select
                  showSearch filterOption={false}
                  placeholder="Buscar por folio o cliente..."
                  loading={buscandoFacturas}
                  onSearch={async (v) => {
                    if (v.length < 2) return;
                    setBuscandoFacturas(true);
                    try {
                      const res = await facturasApi.buscar(v);
                      const lista = res?.data ?? (Array.isArray(res) ? res : []);
                      setFacturaOptions(lista.map((f: any) => ({ value: f.id, label: `${f.folio} — ${f.cliente?.nombre ?? ''}` })));
                    } finally { setBuscandoFacturas(false); }
                  }}
                  onChange={onFacturaChange}
                  options={facturaOptions}
                />
              </Form.Item>
              <Form.Item name="buscarFactura" label="Folio de factura">
                <Input.Search placeholder="FAC-202601-0001" onSearch={async (v) => {
                  const res = await facturasApi.buscar(v);
                  if (res?.data?.[0]) { setFacturaSelId(res.data[0].id); form.setFieldValue('facturaId', res.data[0].id); onFacturaChange(res.data[0].id); }
                }} enterButton="Cargar" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" /></Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="tipo" label="Tipo">
                <Select options={[{ value: 'total', label: 'Total' }, { value: 'parcial', label: 'Parcial' }]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="motivo" label="Motivo de devolución" rules={[{ required: true }]}>
                <Input.TextArea rows={2} placeholder="Producto defectuoso, error en pedido, etc." />
              </Form.Item>
            </Col>
          </Row>

          {lineas.length > 0 && (
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
              dataSource={lineas.map((l, i) => ({ ...l, key: i }))}
              columns={[
                { title: 'Producto',  dataIndex: 'descripcion',    ellipsis: true },
                { title: 'Facturado', dataIndex: 'cantidad',        width: 80 },
                { title: 'A devolver', key: 'dev', width: 120,
                  render: (_: any, r: any, idx: number) => (
                    <InputNumber
                      min={0}
                      max={r.cantidad}
                      precision={4}
                      value={r.devolver}
                      style={{ width: '100%' }}
                      onChange={v => { const u=[...lineas]; u[idx].devolver=v??0; setLineas(u); }} />
                  )},
                { title: 'Precio', dataIndex: 'precioUnitario', width: 100, render: (v: number) => fmt.money(v) },
              ]} />
          )}

          <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
            <Col><Button onClick={() => setOpen(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={createMut.isPending} disabled={lineas.filter(l=>l.devolver>0).length===0}>Registrar devolución</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Detalle */}
      <Drawer title={`Devolución ${detail?.numero}`} open={!!detail} onClose={() => setDetail(null)} width={600}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Número">{detail.numero}</Descriptions.Item>
              <Descriptions.Item label="Estado"><Tag color={estadoColor[detail.estado as EstadoDev]}>{detail.estado.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Tipo">{detail.tipo}</Descriptions.Item>
              <Descriptions.Item label="Fecha">{fmt.date(detail.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Cliente">{detail.cliente?.nombre}</Descriptions.Item>
              <Descriptions.Item label="Factura original">{detail.factura?.folio}</Descriptions.Item>
              <Descriptions.Item label="Origen">
                {detail.generadaDesdeNc
                  ? <Tag color="blue">Desde NC {detail.notaCreditoNumero ?? ''}</Tag>
                  : <Tag>Manual</Tag>}
              </Descriptions.Item>
              {!detail.generadaDesdeNc && detail.notaCreditoNumero && (
                <Descriptions.Item label="NC generada">
                  <Tag color="green">✓ {detail.notaCreditoNumero}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Motivo" span={2}>{detail.motivo}</Descriptions.Item>
            </Descriptions>
            <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false} dataSource={detail.detalles ?? []} rowKey="id"
              columns={[
                { title: 'Producto', dataIndex: 'descripcion', ellipsis: true },
                { title: 'Cant.',    dataIndex: 'cantidad',    width: 60 },
                { title: 'Precio',   dataIndex: 'precioUnitario', render: (v: number) => fmt.money(v) },
                { title: 'Total',    dataIndex: 'total', render: (v: number) => <strong>{fmt.money(v)}</strong> },
              ]} />
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={24} sm={8}><Statistic title="Subtotal" value={detail.subtotal} formatter={v => fmt.money(Number(v))} /></Col>
              <Col xs={24} sm={8}><Statistic title="ITBIS" value={detail.iva} formatter={v => fmt.money(Number(v))} /></Col>
              <Col xs={24} sm={8}><Statistic title="Total devuelto" value={detail.total} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#dc2626' }} /></Col>
            </Row>
          </>
        )}
      </Drawer>

      {/* Confirmar recepción — el movimiento de inventario ocurre aquí, no al
          crear la devolución. Elige almacén de entrada y, si el cliente
          devolvió menos de lo solicitado, ajusta la cantidad por línea. */}
      <Modal
        title={`Confirmar recepción — ${recepcion?.numero ?? ''}`}
        open={!!recepcion}
        onCancel={() => { setRecepcion(null); setCantidadesRecepcion({}); formRecepcion.resetFields(); }}
        footer={null}
        width={560}
        destroyOnClose
      >
        {recepcion && (
          <Form form={formRecepcion} layout="vertical"
            onFinish={() => {
              const detalles = (recepcion.detalles ?? [])
                .map((d: any) => ({ detalleId: d.id, cantidad: Number(cantidadesRecepcion[d.id] ?? d.cantidad) }))
                .filter((d: any) => d.cantidad > 0);
              procesarMut.mutate({ id: recepcion.id, almacenId: formRecepcion.getFieldValue('almacenId'), detalles });
            }}
          >
            {recepcion.generadaDesdeNc && (
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message={`Generada automáticamente desde la NC ${recepcion.notaCreditoNumero ?? ''}`}
                description="Ya tiene su Nota de Crédito y su asiento contable — aquí solo se confirma que la mercancía entró físicamente."
              />
            )}

            <Form.Item name="almacenId" label="Almacén de entrada">
              <Select
                allowClear
                placeholder="Almacén por defecto de la empresa"
                options={almacenes.map((a: any) => ({ value: a.id, label: a.nombre }))}
              />
            </Form.Item>

            <Text strong style={{ display: 'block', marginBottom: 8 }}>Cantidades recibidas</Text>
            <Table
              size="small" pagination={false} scroll={{ x: 'max-content' }}
              dataSource={(recepcion.detalles ?? []).map((d: any) => ({ ...d, key: d.id }))}
              columns={[
                { title: 'Producto',   dataIndex: 'descripcion', ellipsis: true },
                { title: 'Solicitado', dataIndex: 'cantidad',    width: 90 },
                { title: 'Recibido',   key: 'recibido', width: 120,
                  render: (_: any, d: any) => (
                    <InputNumber
                      min={0} max={Number(d.cantidad)} precision={4}
                      value={cantidadesRecepcion[d.id] ?? Number(d.cantidad)}
                      style={{ width: '100%' }}
                      onChange={v => setCantidadesRecepcion(prev => ({ ...prev, [d.id]: v ?? 0 }))}
                    />
                  ) },
              ]}
            />

            <Row justify="end" gutter={8} style={{ marginTop: 16 }}>
              <Col><Button onClick={() => { setRecepcion(null); setCantidadesRecepcion({}); formRecepcion.resetFields(); }}>Cancelar</Button></Col>
              <Col><Button type="primary" htmlType="submit" loading={procesarMut.isPending}>Confirmar recepción</Button></Col>
            </Row>
          </Form>
        )}
      </Modal>
    </div>
  );
}
