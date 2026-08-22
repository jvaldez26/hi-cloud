import { useState, useEffect, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, Tabs,
  message, Progress, Select, InputNumber, Badge, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SwapOutlined,
  InboxOutlined, WarningOutlined, CheckOutlined, FileExcelOutlined, CloseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const almApi = {
  resumen:     ()                => api.get('/almacenes/resumen').then(r => r.data?.data ?? r.data),
  listar:      ()                => api.get('/almacenes').then(r => r.data?.data ?? r.data ?? []),
  crear:       (b: any)          => api.post('/almacenes', b).then(r => r.data?.data ?? r.data),
  eliminar:    (id: number)      => api.delete(`/almacenes/${id}`).then(r => r.data?.data ?? r.data),
  stock:       (id: number)      => api.get(`/almacenes/${id}/stock`).then(r => r.data?.data ?? r.data ?? []),
  transferencias: (p = 1, almId?: number) =>
    api.get(`/almacenes/transferencias?page=${p}${almId ? `&almacenId=${almId}` : ''}`).then(r => r.data?.data ?? r.data),
  crearTransf: (b: any)          => api.post('/almacenes/transferencias', b).then(r => r.data?.data ?? r.data),
  confirmar:   (id: number)      => api.patch(`/almacenes/transferencias/${id}/confirmar`).then(r => r.data?.data ?? r.data),
  recibir:     (id: number)      => api.patch(`/almacenes/transferencias/${id}/recibir`).then(r => r.data?.data ?? r.data),
  cancelar:    (id: number)      => api.patch(`/almacenes/transferencias/${id}/cancelar`).then(r => r.data?.data ?? r.data),
  productos:   ()                => api.get('/productos?limit=5000&incluirSinStock=true').then(r => r.data?.data?.data ?? r.data?.data ?? []),
};

const ESTADO_TRANSF: Record<string, { label: string; color: string }> = {
  pendiente:   { label: 'Pendiente',   color: 'warning' },
  borrador:    { label: 'Pendiente',   color: 'warning' },  // backwards compat
  en_transito: { label: 'En tránsito', color: 'processing' },
  completada:  { label: 'Completada',  color: 'success' },
  cancelada:   { label: 'Cancelada',   color: 'error' },
};

const FILTROS_KEY = 'alm-filtros-v1';

export default function AlmacenesPage() {
  const { token } = theme.useToken();
  const [almSeleccionado, setAlmSeleccionado] = useState<any>(null);
  const [crearModal,  setCrearModal]  = useState(false);
  const [transfModal, setTransfModal] = useState(false);
  const [formAlm]    = Form.useForm();
  const [formTransf] = Form.useForm();
  const qc = useQueryClient();

  // ── Filtros del Stock tab ────────────────────────────────────────────────
  const [filtros, setFiltros] = useState<{
    estado?: string;
    orden?:  string;
  }>(() => {
    try { return JSON.parse(sessionStorage.getItem(FILTROS_KEY) ?? '{}'); }
    catch { return {}; }
  });
  const [buscarInput, setBuscarInput] = useState<string>(() => {
    try { return JSON.parse(sessionStorage.getItem(FILTROS_KEY) ?? '{}').buscar ?? ''; }
    catch { return ''; }
  });
  const [buscar, setBuscar] = useState(buscarInput);

  // Debounce buscador 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscar(buscarInput);
      setFiltros(p => ({ ...p, buscar: buscarInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [buscarInput]);

  // Persistir filtros en sessionStorage
  useEffect(() => {
    sessionStorage.setItem(FILTROS_KEY, JSON.stringify({ ...filtros, buscar }));
  }, [filtros, buscar]);

  const { data: resumen }    = useQuery({ queryKey: ['alm-resumen'], queryFn: almApi.resumen });
  const { data: almacenes }  = useQuery({ queryKey: ['alm-list'],    queryFn: almApi.listar });
  const { data: sucursales } = useQuery({
    queryKey: ['sucursales'],
    queryFn:  () => api.get('/auth/mis-sucursales').then(r => r.data?.data ?? []),
  });
  const { data: stock, isLoading: loadStock } = useQuery({
    queryKey: ['alm-stock', almSeleccionado?.id],
    queryFn:  () => almApi.stock(almSeleccionado!.id),
    enabled:  !!almSeleccionado,
  });
  const { data: transferencias } = useQuery({
    queryKey: ['alm-transf', almSeleccionado?.id],
    queryFn:  () => almApi.transferencias(1, almSeleccionado?.id),
    enabled:  !!almSeleccionado,
  });
  const { data: productos } = useQuery({ queryKey: ['productos-alm'], queryFn: almApi.productos });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['alm-resumen'] });
    qc.invalidateQueries({ queryKey: ['alm-list'] });
    qc.invalidateQueries({ queryKey: ['alm-stock'] });
    qc.invalidateQueries({ queryKey: ['alm-transf'] });
  };

  const crearMut = useMutation({
    mutationFn: almApi.crear,
    onSuccess: () => { inv(); setCrearModal(false); formAlm.resetFields(); message.success('Almacén creado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const transfMut = useMutation({
    mutationFn: almApi.crearTransf,
    onSuccess: () => { inv(); setTransfModal(false); formTransf.resetFields(); message.success('Transferencia creada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const confirmarMut = useMutation({
    mutationFn: almApi.confirmar,
    onSuccess: () => { inv(); message.success('Transferencia en tránsito — stock descontado del origen'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al confirmar'),
  });

  const recibirMut = useMutation({
    mutationFn: almApi.recibir,
    onSuccess: () => { inv(); message.success('Transferencia completada — stock recibido en destino'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al recibir'),
  });

  const cancelarMut = useMutation({
    mutationFn: almApi.cancelar,
    onSuccess: () => { inv(); message.success('Transferencia cancelada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cancelar'),
  });

  // ── Stock filtrado y ordenado ────────────────────────────────────────────
  const stockFiltrado = useMemo(() => {
    let items: any[] = stock ?? [];

    // Buscador por nombre o código
    if (buscar.trim()) {
      const q = buscar.trim().toLowerCase();
      items = items.filter(r =>
        r.producto?.nombre?.toLowerCase().includes(q) ||
        r.producto?.codigo?.toLowerCase().includes(q),
      );
    }

    // Filtro estado
    const est = filtros.estado ?? 'todos';
    if (est !== 'todos') {
      items = items.filter(r => {
        const s = Number(r.stock);
        const m = Number(r.stockMinimo ?? 0);
        if (est === 'ok')   return s > m;
        if (est === 'bajo') return s > 0 && s <= m;
        if (est === 'sin')  return s === 0;
        return true;
      });
    }

    // Ordenar
    const sorted = [...items];
    switch (filtros.orden ?? 'nombre_az') {
      case 'stock_mayor':  sorted.sort((a, b) => Number(b.stock) - Number(a.stock)); break;
      case 'stock_menor':  sorted.sort((a, b) => Number(a.stock) - Number(b.stock)); break;
      case 'bajo_primero': sorted.sort((a, b) => {
        const ab = Number(a.stock) <= Number(a.stockMinimo ?? 0) ? 0 : 1;
        const bb = Number(b.stock) <= Number(b.stockMinimo ?? 0) ? 0 : 1;
        return ab - bb;
      }); break;
      default: sorted.sort((a, b) =>
        (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? ''));
    }
    return sorted;
  }, [stock, buscar, filtros.estado, filtros.orden]);

  const hayFiltros = buscar.trim() !== '' ||
    (filtros.estado && filtros.estado !== 'todos') ||
    (filtros.orden  && filtros.orden  !== 'nombre_az');

  const limpiarFiltros = () => {
    setBuscarInput(''); setBuscar('');
    setFiltros({});
    sessionStorage.removeItem(FILTROS_KEY);
  };

  const COLS_DEF = [
    { key: 'numero',   label: 'Número',   defaultVisible: true  },
    { key: 'orig',     label: 'Origen',   defaultVisible: true  },
    { key: 'dest',     label: 'Destino',  defaultVisible: true  },
    { key: 'prod',     label: 'Producto', defaultVisible: true  },
    { key: 'cantidad', label: 'Cantidad', defaultVisible: true  },
    { key: 'fecha',    label: 'Fecha',    defaultVisible: true  },
    { key: 'estado',   label: 'Estado',   defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('almacenes', COLS_DEF);

  const colsStock = [
    { title: 'Código',   key: 'cod', width: 100, render: (_: any, r: any) => r.producto?.codigo },
    { title: 'Producto', key: 'nom', ellipsis: true, render: (_: any, r: any) => r.producto?.nombre },
    { title: 'Stock',    dataIndex: 'stock', width: 100,
      render: (v: number, r: any) => (
        <Text strong style={{ color: Number(v) <= Number(r.stockMinimo) ? '#ef4444' : '#10b981' }}>
          {Number(v).toFixed(2)}
        </Text>
      )},
    { title: 'Mínimo',  dataIndex: 'stockMinimo', width: 80 },
    { title: 'Estado', key: 'est', width: 110,
      render: (_: any, r: any) => Number(r.stock) <= Number(r.stockMinimo)
        ? <Tag icon={<WarningOutlined />} color="warning">Stock bajo</Tag>
        : <Tag color="success">OK</Tag> },
  ];

  const colsTransf = [
    { title: 'Número',   dataIndex: 'numero',  width: 130, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Origen',   key: 'orig', width: 130, render: (_: any, r: any) => r.almacenOrigen?.nombre },
    { title: 'Destino',  key: 'dest', width: 130, render: (_: any, r: any) => r.almacenDestino?.nombre },
    { title: 'Producto', key: 'prod', ellipsis: true, render: (_: any, r: any) => r.producto?.nombre },
    { title: 'Cantidad', dataIndex: 'cantidad', width: 90 },
    { title: 'Fecha',    dataIndex: 'fecha',    width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Estado',   dataIndex: 'estado',   width: 120,
      render: (v: string) => {
        const s = ESTADO_TRANSF[v] ?? { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      }},
    { title: '', key: 'actions', width: 100, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          items={[
            ...((r.estado === 'pendiente' || r.estado === 'borrador') ? [{
              key: 'confirmar',
              label: 'Confirmar → En tránsito',
              icon: <CheckOutlined />,
              onClick: () => Modal.confirm({
                title: '¿Confirmar transferencia?',
                content: 'Se descontará el stock del almacén origen.',
                okText: 'Confirmar',
                cancelText: 'Volver',
                onOk: () => confirmarMut.mutate(r.id),
              }),
            }] : []),
            ...(r.estado === 'en_transito' ? [{
              key: 'recibir',
              label: 'Marcar como Recibida',
              icon: <CheckCircleOutlined />,
              onClick: () => Modal.confirm({
                title: '¿Marcar transferencia como recibida?',
                content: 'Se sumará el stock al almacén destino.',
                okText: 'Confirmar recepción',
                cancelText: 'Volver',
                onOk: () => recibirMut.mutate(r.id),
              }),
            }] : []),
            ...((r.estado === 'pendiente' || r.estado === 'borrador' || r.estado === 'en_transito') ? [{
              key: 'cancelar',
              label: 'Cancelar transferencia',
              danger: true,
              icon: <CloseCircleOutlined />,
              onClick: () => Modal.confirm({
                title: '¿Cancelar transferencia?',
                content: r.estado === 'en_transito'
                  ? 'Se revertirá el stock al almacén origen.'
                  : 'La transferencia quedará cancelada sin afectar el stock.',
                okText: 'Cancelar transferencia',
                cancelText: 'Volver',
                okButtonProps: { danger: true },
                onOk: () => cancelarMut.mutate(r.id),
              }),
            }] : []),
          ]}
        />
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <InboxOutlined style={{ marginRight: 8, color: '#06b6d4' }} />
            Almacenes Múltiples
          </Title>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (almacenes ?? []).map((a: any) => ({
                'Código':    a.codigo ?? '',
                'Nombre':    a.nombre ?? '',
                'Tipo':      a.tipo ?? '',
                'Ubicación': a.ubicacion ?? '',
                'Responsable': a.responsable ?? '',
                'Activo':    a.isActive ? 'Sí' : 'No',
              }));
              exportarExcel(filas, `Almacenes-${dayjs().format('YYYY-MM-DD')}`);
            }}>Excel</Button>
            <RefreshByKeyButton queryKey={['almacenes']} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <VideoTutorialButton />
            <Button icon={<SwapOutlined />} onClick={() => setTransfModal(true)}>
              Nueva transferencia
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearModal(true)}>
              Nuevo almacén
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Tarjetas de almacenes */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {(resumen ?? []).map((alm: any) => (
          <Col xs={24} sm={12} md={8} key={alm.id}>
            <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
              <Card
                onClick={() => setAlmSeleccionado(alm)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 12,
                  border: almSeleccionado?.id === alm.id
                    ? `2px solid ${token.colorInfo}`
                    : `1px solid ${token.colorBorderSecondary}`,
                  boxShadow: almSeleccionado?.id === alm.id
                    ? `0 0 0 3px ${token.colorInfoBg}`
                    : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong style={{ fontSize: 15 }}>{alm.nombre}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{alm.ciudad ?? alm.responsable ?? '—'}</Text>
                  </div>
                  {alm.stockBajo > 0 && (
                    <Badge count={alm.stockBajo} title="Productos con stock bajo">
                      <WarningOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
                    </Badge>
                  )}
                </div>
                <Row gutter={8} style={{ marginTop: 12 }}>
                  <Col xs={24} sm={12}>
                    <Statistic title="Productos" value={alm.totalProductos} valueStyle={{ fontSize: 20 }} />
                  </Col>
                  <Col xs={24} sm={12}>
                    <Statistic title="Valor estimado" value={fmt.money(alm.valorTotal)}
                      valueStyle={{ fontSize: 14, color: token.colorInfo }} />
                  </Col>
                </Row>
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      {/* Panel detalle almacén seleccionado */}
      {almSeleccionado && (
        <Tabs items={[
          {
            key: 'stock',
            label: <><InboxOutlined /> Stock</>,
            children: (
              <Card title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Stock en
                  <Select
                    size="small"
                    value={almSeleccionado?.id}
                    onChange={id => setAlmSeleccionado(
                      (almacenes ?? []).find((a: any) => a.id === id) ?? null
                    )}
                    options={(almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }))}
                    style={{ minWidth: 140, fontWeight: 'normal', fontSize: 13 }}
                    variant="borderless"
                  />
                </span>
              }>
                {/* ── Barra de filtros ──────────────────────────────── */}
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                  alignItems: 'center', marginBottom: 12,
                }}>
                  {/* Buscador */}
                  <Input
                    placeholder="Nombre o código..."
                    value={buscarInput}
                    onChange={e => setBuscarInput(e.target.value)}
                    allowClear
                    onClear={() => { setBuscarInput(''); setBuscar(''); }}
                    size="small"
                    style={{ width: 190 }}
                    prefix={<span style={{ color: token.colorTextQuaternary, fontSize: 12 }}>🔍</span>}
                  />

                  {/* Estado — pills */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([
                      { key: 'todos', label: 'Todos' },
                      { key: 'ok',    label: '✓ OK' },
                      { key: 'bajo',  label: '⚠ Stock bajo' },
                      { key: 'sin',   label: '✕ Sin stock'  },
                    ] as const).map(opt => {
                      const activo = (filtros.estado ?? 'todos') === opt.key;
                      return (
                        <button key={opt.key}
                          onClick={() => setFiltros(p => ({ ...p, estado: opt.key }))}
                          style={{
                            padding: '2px 10px', borderRadius: 20, fontSize: 12,
                            border: `1px solid ${activo ? token.colorPrimary : token.colorBorderSecondary}`,
                            background: activo ? token.colorPrimary : 'transparent',
                            color:      activo ? '#fff' : token.colorText,
                            cursor: 'pointer', outline: 'none',
                            transition: 'all 0.15s',
                          }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ordenar por */}
                  <Select
                    size="small"
                    value={filtros.orden ?? 'nombre_az'}
                    onChange={v => setFiltros(p => ({ ...p, orden: v }))}
                    style={{ minWidth: 170 }}
                    options={[
                      { value: 'nombre_az',   label: '↕ Nombre A-Z'           },
                      { value: 'stock_mayor', label: '↓ Stock mayor primero'   },
                      { value: 'stock_menor', label: '↑ Stock menor primero'   },
                      { value: 'bajo_primero',label: '⚠ Stock bajo primero'   },
                    ]}
                  />

                  {/* Contador + limpiar */}
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {stockFiltrado.length} de {(stock ?? []).length} productos
                  </Text>
                  {hayFiltros && (
                    <button onClick={limpiarFiltros} style={{
                      padding: '2px 10px', borderRadius: 6, fontSize: 12,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      background: 'transparent', color: token.colorTextSecondary,
                      cursor: 'pointer', outline: 'none',
                    }}>
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {/* ── Tabla ─────────────────────────────────────────── */}
                <Table columns={colsStock} dataSource={stockFiltrado} rowKey="id"
                  loading={loadStock} size="small"
                  scroll={{ x: 'max-content' }}
                  pagination={stockFiltrado.length > 30
                    ? { pageSize: 10, showSizeChanger: false, size: 'small' }
                    : false
                  }
                  locale={{ emptyText: hayFiltros
                    ? 'Sin productos con esos filtros — prueba limpiarlos'
                    : 'Sin productos en este almacén'
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'transferencias',
            label: <><SwapOutlined /> Transferencias</>,
            children: (
              <Card title={`Transferencias — ${almSeleccionado.nombre}`}>
                <Table columns={filterColumns(colsTransf)} dataSource={Array.isArray(transferencias) ? transferencias : (transferencias?.data ?? [])} rowKey="id"
                  size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
              </Card>
            ),
          },
        ]} />
      )}

      {/* Modal crear almacén */}
      <Modal title="Nuevo Almacén" open={crearModal}
        onCancel={() => setCrearModal(false)} footer={null} width={480}>
        <Form form={formAlm} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código corto" tooltip="Ej: ALM01, BDG-A — se usa para auto-generar códigos de ubicación WMS"><Input placeholder="ALM01" maxLength={20} /></Form.Item></Col>
            {Array.isArray(sucursales) && sucursales.length > 0 && (
              <Col span={24}>
                <Form.Item name="sucursalId" label="Sucursal" tooltip="Vincular este almacén a una sucursal para el filtrado de stock por sucursal">
                  <Select allowClear placeholder="Sin sucursal asignada"
                    options={sucursales.map((s: any) => ({ value: s.id, label: s.nombre }))} />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={14}><Form.Item name="direccion" label="Dirección"><Input /></Form.Item></Col>
            <Col xs={24} sm={10}><Form.Item name="ciudad" label="Ciudad"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="responsable" label="Responsable"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="telefono" label="Teléfono"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal transferencia */}
      <Modal title={<><SwapOutlined /> Transferencia entre almacenes</>}
        open={transfModal} onCancel={() => setTransfModal(false)} footer={null} width={520}>
        <Form form={formTransf} layout="vertical"
          onFinish={v => transfMut.mutate({ ...v, fecha: hoyRD() })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="almacenOrigenId" label="Almacén origen" rules={[{ required: true }]}>
              <Select options={(almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="almacenDestinoId" label="Almacén destino" rules={[{ required: true }]}>
              <Select options={(almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre }))} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="productoId" label="Producto" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={(productos ?? []).map((p: any) => ({ value: p.id, label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.001} step={1} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setTransfModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={transfMut.isPending}>
              Crear transferencia
            </Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
