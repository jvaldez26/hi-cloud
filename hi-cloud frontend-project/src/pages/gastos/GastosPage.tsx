import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { Table, Button, Card, Row, Col, Typography, Statistic, Tag,
         Modal, Form, Input, InputNumber, Select, DatePicker, message,
         Tabs, Popconfirm, Space, Alert, theme, Checkbox } from 'antd';
import { PlusOutlined, DeleteOutlined, FileExcelOutlined, AuditOutlined, PrinterOutlined, LoadingOutlined, SearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { SolicitarAprobacionModal } from '../../components/ui/SolicitarAprobacionModal';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../api/client';
import { ecfApi } from '../../api/ecf.api';
import EcfResultModal from '../../components/ui/EcfResultModal';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// ── Códigos fiscales DGII (Formato 606) ─────────────────────────────────────

const TIPOS_BIENES_606 = [
  { value: '01', label: '01 — Gastos de personal' },
  { value: '02', label: '02 — Trabajo, suministros y servicios' },
  { value: '03', label: '03 — Arrendamientos' },
  { value: '04', label: '04 — Gastos de activos fijos' },
  { value: '05', label: '05 — Gastos de representación' },
  { value: '06', label: '06 — Otras deducciones admitidas' },
  { value: '07', label: '07 — Gastos financieros' },
  { value: '08', label: '08 — Gastos extraordinarios' },
  { value: '09', label: '09 — Compras y gastos del costo de venta' },
  { value: '10', label: '10 — Adquisiciones de activos' },
  { value: '11', label: '11 — Gastos de seguros' },
];

const FORMAS_PAGO_606 = [
  { value: '01', label: '01 — Efectivo' },
  { value: '02', label: '02 — Cheque / Transferencia / Depósito' },
  { value: '03', label: '03 — Tarjeta de Débito / Crédito' },
  { value: '04', label: '04 — Compra a crédito' },
  { value: '05', label: '05 — Permuta' },
  { value: '06', label: '06 — Nota de crédito' },
  { value: '07', label: '07 — Mixto' },
];

/** Sugerencia de tipoBienes según la categoría del ERP.
 *  El usuario puede cambiarlo — es solo un pre-llenado orientativo. */
const CATEGORIA_TIPO_BIENES_SUGERIDO: Record<string, string> = {
  alquiler:           '03',  // Arrendamientos
  servicios_publicos: '02',  // Trabajo, suministros y servicios
  comunicaciones:     '02',
  nomina:             '01',  // Gastos de personal
  materiales_oficina: '02',
  transporte:         '02',
  marketing:          '02',
  impuestos_tasas:    '06',  // Otras deducciones admitidas
  mantenimiento:      '02',
  seguros:            '11',  // Gastos de seguros
  gastos_financieros: '07',  // Gastos financieros
  otros:              '06',
};

const gastosApi = {
  categorias: ()           => api.get('/gastos/categorias').then(r => r.data?.data ?? r.data),
  resumen:    (m: number, a: number) => api.get(`/gastos/resumen?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  anual:      (a: number)  => api.get(`/gastos/anual?anio=${a}`).then(r => r.data?.data ?? r.data),
  list:       (p = 1, m?: number, a?: number, cat?: string, search = '') =>
    api.get(`/gastos?page=${p}${m ? `&mes=${m}&anio=${a}` : ''}${cat ? `&categoria=${cat}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => r.data?.data ?? r.data),
  /** Todos los gastos del filtro activo, sin paginación.
   *  GET /gastos/exportar — endpoint dedicado que no aplica .take()/.skip().
   *  exportarTodos() devuelve el array directamente; ResponseInterceptor lo
   *  envuelve en { success, data: [...] } → un solo nivel de desembalaje. */
  exportAll:  (m?: number, a?: number, cat?: string, search = '') =>
    api.get(`/gastos/exportar?${m ? `mes=${m}&anio=${a}` : ''}${cat ? `&categoria=${cat}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then(r => (r.data?.data ?? r.data ?? []) as any[]),
  crear:      (body: any)  => api.post('/gastos', body).then(r => r.data?.data ?? r.data),
  eliminar:   (id: number) => api.delete(`/gastos/${id}`).then(r => r.data?.data ?? r.data),
};

const COLORES = ['#1677ff','#10b981','#f59e0b','#ef4444','#7c3aed','#0891b2','#f97316','#84cc16','#ec4899','#6b7280'];

export default function GastosPage() {
  const { token } = theme.useToken();
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [mes,        setMes]        = useState(dayjs().month() + 1);
  const [anio,       setAnio]       = useState(dayjs().year());
  const [catFilt,    setCatFilt]    = useState<string | undefined>();
  const [open,             setOpen]             = useState(false);
  const [tieneComprobante, setTieneComprobante] = useState(false);
  const [ecfEncf,          setEcfEncf]          = useState<string | null>(null);
  const [detalleGasto,     setDetalleGasto]     = useState<any>(null);
  const [pdfPending,       setPdfPending]       = useState<number | null>(null);
  const [aprobGasto,       setAprobGasto]       = useState<any>(null);
  const [exportLoading,    setExportLoading]    = useState(false);
  const [form]                      = Form.useForm();
  const qc = useQueryClient();

  const { data: categorias } = useQuery({ queryKey: ['gasto-cats'], queryFn: gastosApi.categorias });

  // Categoría seleccionada en el form — para comportamiento dinámico
  const categoriaWatch  = Form.useWatch('categoria', form);
  const formaPagoWatch  = Form.useWatch('formaPago', form);
  const categoriaInfo   = (categorias as any[])?.find((c: any) => c.value === categoriaWatch);
  const generaE43       = categoriaInfo?.generaE43 === true;

  // Al cambiar a categoría E43, quitar el checkbox de comprobante
  // Al cambiar a otra categoría, sugerir tipoBienes según el mapeo
  const handleCategoriaChange = (value: string) => {
    const info = (categorias as any[])?.find((c: any) => c.value === value);
    if (info?.generaE43) {
      setTieneComprobante(false);
      form.setFieldsValue({ tipoBienes: undefined, formaPago: undefined });
    } else {
      const sugerido = CATEGORIA_TIPO_BIENES_SUGERIDO[value];
      if (sugerido && tieneComprobante) {
        form.setFieldsValue({ tipoBienes: sugerido });
      }
    }
  };
  // Cajas abiertas hoy — para el selector cuando formaPago='01' (efectivo)
  const { data: cajasHoy } = useQuery({
    queryKey: ['caja-hoy-gastos'],
    queryFn: () => api.get('/caja/hoy').then(r => {
      const d = r.data?.data ?? r.data;
      if (Array.isArray(d?.cajas)) return d.cajas as any[];
      if (d?.id)                   return [d] as any[];
      return [] as any[];
    }),
    enabled: open,
    staleTime: 30_000,
  });

  const { data: resumen }    = useQuery({ queryKey: ['gasto-res', mes, anio], queryFn: () => gastosApi.resumen(mes, anio) });
  const { data: anual }      = useQuery({ queryKey: ['gasto-anual', anio], queryFn: () => gastosApi.anual(anio) });
  const { data: lista, isLoading } = useQuery({
    queryKey: ['gastos', page, mes, anio, catFilt, search],
    queryFn:  () => gastosApi.list(page, mes, anio, catFilt, search),
  });

  const crearMut   = useMutation({
    mutationFn: gastosApi.crear,
    onSuccess: (_data, vars: any) => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      qc.invalidateQueries({ queryKey: ['gasto-res'] });
      setOpen(false);
      form.resetFields();
      setTieneComprobante(false);
      const esE43 = (categorias as any[])?.find((c: any) => c.value === vars.categoria)?.generaE43;
      message.success(esE43
        ? 'Gasto registrado — E43 enviado a DGII automáticamente'
        : 'Gasto registrado con asiento contable');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const eliminarMut = useMutation({
    mutationFn: gastosApi.eliminar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos'] }); message.success('Eliminado'); },
  });

  const imprimirPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/gastos/${item.id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { message.warning('El navegador bloqueó la ventana emergente'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  const emitirEcfE43 = useMutation({
    mutationFn: (id: number) => ecfApi.emitirEcfGasto(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      if (res?.encf) setEcfEncf(res.encf);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al emitir e-CF E43',
    ),
  });

  const COLS_DEF = [
    { key: 'fecha',        label: 'Fecha',        defaultVisible: true  },
    { key: 'categoria',    label: 'Categoría',    defaultVisible: true  },
    { key: 'descripcion',  label: 'Descripción',  defaultVisible: true  },
    { key: 'proveedor',    label: 'Proveedor',    defaultVisible: false },
    { key: 'rncProveedor', label: 'RNC Proveedor',defaultVisible: false },
    { key: 'comprobante',  label: 'Comprobante',  defaultVisible: false },
    { key: 'monto',        label: 'Monto',        defaultVisible: true  },
    { key: 'itbis',        label: 'ITBIS',        defaultVisible: false },
    { key: 'total',        label: 'Total',        defaultVisible: true  },
    { key: 'ecf',          label: 'e-CF',         defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns: fcGastos } = useColumnVisibility('gastos', COLS_DEF);

  const cols = [
    { title: 'Fecha',    key: 'fecha',       dataIndex: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Categoría',key: 'categoria',   dataIndex: 'categoria',   width: 170,
      render: (v: string) => {
        const cat = categorias?.find((c: any) => c.value === v);
        return <Tag style={{ fontSize: 11 }}>{cat?.label ?? v}</Tag>;
      }},
    { title: 'Descripción', key: 'descripcion', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Proveedor',    key: 'proveedor',    dataIndex: 'proveedor',    width: 130, render: (v: string) => v ?? '—' },
    { title: 'RNC Proveedor',key: 'rncProveedor', dataIndex: 'rncProveedor', width: 110, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Comprobante',  key: 'comprobante',  dataIndex: 'comprobante',  width: 110, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    { title: 'Monto',   key: 'monto',  dataIndex: 'monto',  width: 110, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',   key: 'itbis',  dataIndex: 'itbis',  width: 90, render: (v: number) => v > 0 ? fmt.money(v) : '—' },
    { title: 'Total',   key: 'total',  dataIndex: 'total',  width: 120, render: (v: number) => <Text strong style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> },
    {
      title: 'e-CF', key: 'ecf', width: 130,
      render: (_: any, r: any) => {
        if (r.ecfNumero) return <Tag color="green" style={{ fontSize: 10, fontFamily: 'monospace' }}>✅ {r.ecfNumero}</Tag>;
        if (r.categoria === 'gasto_menor') {
          return (
            <Popconfirm
              title="¿Emitir e-CF E43 (Gasto Menor)?"
              description="Se enviará a la DGII. Todo el monto va como exento."
              onConfirm={() => emitirEcfE43.mutate(r.id)}
              okText="Emitir E43"
            >
              <Button type="dashed" size="small" icon={<AuditOutlined />}
                loading={emitirEcfE43.isPending}
                style={{ color: '#7c3aed', borderColor: '#7c3aed', fontSize: 11 }}>
                Emitir E43
              </Button>
            </Popconfirm>
          );
        }
        return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
      },
    },
    { title: '', key: 'acciones', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalleGasto(r)}
          viewLabel="Ver gasto"
          items={[
            { key: 'pdf', label: pdfPending === r.id ? 'Generando...' : 'Imprimir',
              icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
              disabled: pdfPending === r.id,
              onClick: () => imprimirPDF(r) },
            { type: 'divider' as const },
            {
              key: 'solicitar-aprobacion',
              label: <><CheckCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />Solicitar aprobación</>,
              onClick: () => setAprobGasto(r),
            },
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar gasto', icon: <DeleteOutlined />, danger: true,
              onClick: () => Modal.confirm({
                title: '¿Eliminar este gasto?',
                okText: 'Confirmar',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                onOk: () => eliminarMut.mutate(r.id),
              }) },
          ]}
        />
      )},
  ];

  const MESES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }));

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Gastos Operativos</Title></Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 100 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); form.resetFields(); setTieneComprobante(false); }}>
              Registrar gasto
            </Button>
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="resumen" items={[
        {
          key: 'resumen', label: '📊 Resumen',
          children: (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="Total del mes" value={resumen?.totalGastos ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444' }} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="Monto sin ITBIS" value={resumen?.totalMonto ?? 0} formatter={v => fmt.money(Number(v))} /></Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small"><Statistic title="ITBIS Crédito Fiscal" value={resumen?.totalItbis ?? 0} formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#10b981' }} /></Card>
                </Col>
              </Row>

              {/* Gráfica por categoría */}
              {resumen?.porCategoria?.length > 0 && (
                <Card title="Distribución por categoría" style={{ marginBottom: 16 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={resumen.porCategoria} layout="vertical">
                      <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmt.money(v)} />
                      <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                        {resumen.porCategoria.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORES[i % COLORES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          ),
        },
        {
          key: 'anual', label: '📅 Tendencia Anual',
          children: (
            <Card title={`Gastos mensuales ${anio}`}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={anual ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt.money(v)} />
                  <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          ),
        },
        {
          key: 'listado', label: '📋 Detalle',
          children: (
            <>
              <Row justify="space-between" style={{ marginBottom: 12 }}>
                <Col>
                  <Space>
                    <Input
                      placeholder="Buscar por descripción..."
                      prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      allowClear
                      style={{ width: 220 }}
                    />
                    <Select placeholder="Filtrar categoría" allowClear style={{ width: 220 }}
                      value={catFilt} onChange={setCatFilt}
                      options={categorias?.map((c: any) => ({ value: c.value, label: c.label }))} />
                  </Space>
                </Col>
                <Col>
                  <Button
                    icon={<FileExcelOutlined />}
                    loading={exportLoading}
                    onClick={async () => {
                      setExportLoading(true);
                      try {
                        const todos = await gastosApi.exportAll(mes, anio, catFilt, search);
                        const filas = todos.map((g: any) => ({
                          'Fecha':         g.fecha ? dayjs(g.fecha).format('DD/MM/YYYY') : '',
                          'Categoría':     g.categoria ?? '',
                          'Descripción':   g.descripcion ?? '',
                          'Proveedor':     g.proveedor ?? '',
                          'RNC Proveedor': g.rncProveedor ?? '',
                          'Comprobante':   g.comprobante ?? '',
                          'Tipo bienes':   g.tipoBienes ?? '',
                          'Forma de pago': g.formaPago ?? '',
                          'Monto':         Number(g.monto ?? 0),
                          'ITBIS':         Number(g.itbis ?? 0),
                          'Total':         Number(g.total ?? 0),
                        }));
                        exportarExcel(filas, `Gastos-${anio}-${String(mes).padStart(2,'0')}`);
                        message.success(`${filas.length} gastos exportados`);
                      } catch (e: any) {
                        const detalle = e?.response?.data?.errors?.[0]
                          ?? e?.response?.data?.message
                          ?? e?.message
                          ?? 'Error desconocido';
                        message.error(`No se pudo exportar: ${detalle}`);
                        console.error('[exportar gastos]', e);
                      } finally {
                        setExportLoading(false);
                      }
                    }}
                  >
                    Excel
                  </Button>
                  <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
                  <RefreshByKeyButton queryKey={['gastos']} />
                  <VideoTutorialButton />
                </Col>
              </Row>
              <Table columns={fcGastos(cols as any)} dataSource={lista?.data ?? []} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
                pagination={{ total: lista?.meta?.total, pageSize: 10, current: page,
                              onChange: setPage, showSizeChanger: false }} />
            </>
          ),
        },
      ]} />

      {/* Modal crear gasto */}
      <Modal
        title="Registrar Gasto"
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); setTieneComprobante(false); }}
        footer={null}
        width={620}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={v => crearMut.mutate({
            ...v,
            fecha: v.fecha.format('YYYY-MM-DD'),
            itbis: generaE43 ? 0 : (v.itbis ?? 0),
          })}
          initialValues={{ fecha: dayjs() }}
        >
          {/* Fila 1: Fecha + Categoría */}
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="categoria" label="Categoría" rules={[{ required: true }]}>
                <Select
                  placeholder="Seleccionar categoría"
                  options={categorias?.map((c: any) => ({ value: c.value, label: c.label }))}
                  onChange={handleCategoriaChange}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Badge informativo según categoría */}
          {generaE43 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14, fontSize: 12 }}
              message={<><strong>📋 Este gasto generará un E43 automáticamente</strong> — Todo el monto va como exento (sin ITBIS). El E43 se enviará a la DGII al registrar.</>}
            />
          )}
          {!generaE43 && categoriaWatch && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 14, fontSize: 12 }}
              message="Ingresa el NCF que te emitió el proveedor en «No. Comprobante»."
            />
          )}

          {/* Descripción */}
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
            <Input placeholder={generaE43 ? 'Ej: Compra de materiales de limpieza' : 'Descripción del gasto'} />
          </Form.Item>

          {/* Montos */}
          <Row gutter={12}>
            <Col span={generaE43 ? 12 : 9}>
              <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            {!generaE43 && (
              <Col xs={24} sm={7}>
                <Form.Item name="itbis" label="ITBIS (RD$)" tooltip="Si aplica crédito fiscal">
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} />
                </Form.Item>
              </Col>
            )}
            {generaE43 && (
              <Col xs={24} sm={12}>
                <Form.Item label="ITBIS">
                  <InputNumber style={{ width: '100%' }} value={0} disabled
                    placeholder="0.00 (exento — E43 no aplica ITBIS)" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* Campos según tipo */}
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="proveedor"
                label={generaE43 ? 'Proveedor (opcional)' : 'Proveedor'}
              >
                <Input placeholder={generaE43 ? 'Nombre del vendedor informal' : 'Nombre del proveedor'} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              {generaE43 ? (
                <Form.Item name="comprobante" label="Referencia (opcional)">
                  <Input placeholder="Descripción o referencia interna" />
                </Form.Item>
              ) : (
                <Form.Item name="rncProveedor" label={tieneComprobante ? 'RNC Proveedor *' : 'RNC Proveedor'}
                  rules={tieneComprobante ? [{ required: true, message: 'RNC obligatorio cuando tiene comprobante' }] : []}>
                  <Input placeholder="9 dígitos" maxLength={9} />
                </Form.Item>
              )}
            </Col>
            {!generaE43 && (
              <Col xs={24} sm={12}>
                <Form.Item name="comprobante" label={tieneComprobante ? 'No. Comprobante (NCF) *' : 'No. Comprobante (NCF recibido)'}
                  rules={tieneComprobante ? [{ required: true, message: 'NCF obligatorio cuando tiene comprobante' }] : []}>
                  <Input placeholder="E310000000001" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Checkbox "Tiene comprobante fiscal" + campos 606 ────────────────── */}
          {!generaE43 && (
            <>
              <div style={{ marginBottom: tieneComprobante ? 12 : 4 }}>
                <Checkbox
                  checked={tieneComprobante}
                  onChange={e => {
                    const checked = e.target.checked;
                    setTieneComprobante(checked);
                    if (checked && categoriaWatch) {
                      const sugerido = CATEGORIA_TIPO_BIENES_SUGERIDO[categoriaWatch];
                      if (sugerido) form.setFieldsValue({ tipoBienes: sugerido });
                    }
                    if (!checked) {
                      form.setFieldsValue({ tipoBienes: undefined, formaPago: undefined, cajaDiariaId: undefined });
                    }
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Este gasto tiene comprobante fiscal (incluir en Formato 606)
                  </span>
                </Checkbox>
              </div>

              {tieneComprobante && (
                <Alert
                  type="success"
                  showIcon
                  style={{ marginBottom: 12, fontSize: 12 }}
                  message="Gasto marcado como reportable al 606 — completa los campos fiscales obligatorios."
                />
              )}

              {tieneComprobante && (
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="tipoBienes" label="Tipo de bienes / servicios (DGII)"
                      rules={[{ required: true, message: 'Requerido por el Formato 606' }]}
                      tooltip="Código oficial DGII — sugiere un valor según la categoría. Revísalo antes de guardar.">
                      <Select placeholder="Seleccionar tipo" options={TIPOS_BIENES_606} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="formaPago" label="Forma de pago (DGII)"
                      rules={[{ required: true, message: 'Requerido por el Formato 606' }]}>
                      <Select
                        placeholder="Seleccionar forma"
                        options={FORMAS_PAGO_606}
                        onChange={val => {
                          if (val !== '01') form.setFieldsValue({ cajaDiariaId: undefined });
                        }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
              {tieneComprobante && formaPagoWatch === '01' && (
                <Form.Item
                  name="cajaDiariaId"
                  label="Caja de efectivo"
                  rules={[{ required: true, message: 'Selecciona la caja a la que se imputa este gasto' }]}
                  tooltip="El monto se descontará del cuadre de esa caja como gasto de efectivo"
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    placeholder="Seleccionar caja activa"
                    loading={!cajasHoy}
                    notFoundContent="No hay cajas abiertas hoy"
                    options={(cajasHoy ?? []).map((c: any) => ({
                      value: c.id,
                      label: c.vendedorNombre ? `${c.vendedorNombre} — Caja #${c.id}` : `Caja #${c.id}`,
                    }))}
                  />
                </Form.Item>
              )}
            </>
          )}

          <Row justify="end" gutter={8} style={{ marginTop: 4 }}>
            <Col><Button onClick={() => { setOpen(false); form.resetFields(); setTieneComprobante(false); }}>Cancelar</Button></Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                loading={crearMut.isPending}
                style={generaE43 ? { background: '#7c3aed', borderColor: '#7c3aed' } : {}}
              >
                {generaE43 ? '📋 Registrar y emitir E43' : 'Registrar gasto'}
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      <EcfResultModal encf={ecfEncf} onClose={() => setEcfEncf(null)} />

      {aprobGasto && (
        <SolicitarAprobacionModal
          open={!!aprobGasto}
          onClose={() => setAprobGasto(null)}
          tipo="gasto"
          entidadId={aprobGasto.id}
          entidadRef={`GAS-${String(aprobGasto.id).padStart(6, '0')}`}
          monto={aprobGasto.total}
        />
      )}

      <DetailDrawer
        open={!!detalleGasto}
        onClose={() => setDetalleGasto(null)}
        title={`Gasto — ${detalleGasto?.comprobante ?? detalleGasto?.id ?? ''}`}
        sections={[{
          fields: [
            { label: 'Fecha',        value: detalleGasto?.fecha },
            { label: 'Categoría',    value: detalleGasto?.categoria?.replace(/_/g,' ') },
            { label: 'Descripción',  value: detalleGasto?.descripcion, span: 2 },
            { label: 'Proveedor',     value: detalleGasto?.proveedor },
            { label: 'RNC Proveedor', value: detalleGasto?.rncProveedor },
            { label: 'Comprobante',   value: detalleGasto?.comprobante },
            { label: 'Tipo bienes',   value: detalleGasto?.tipoBienes, hidden: !detalleGasto?.tipoBienes },
            { label: 'Forma de pago', value: detalleGasto?.formaPago,  hidden: !detalleGasto?.formaPago  },
            { label: 'Monto',         value: detalleGasto?.monto !== undefined ? `RD$${Number(detalleGasto.monto).toLocaleString('es-DO',{minimumFractionDigits:2})}` : undefined },
            { label: 'ITBIS',         value: detalleGasto?.itbis !== undefined ? `RD$${Number(detalleGasto.itbis).toLocaleString('es-DO',{minimumFractionDigits:2})}` : undefined },
            { label: 'Total',         value: detalleGasto?.total !== undefined ? `RD$${Number(detalleGasto.total).toLocaleString('es-DO',{minimumFractionDigits:2})}` : undefined },
            { label: 'e-CF',          value: detalleGasto?.ecfNumero, hidden: !detalleGasto?.ecfNumero },
          ],
        }]}
      />
    </div>
  );
}
