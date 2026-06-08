import { useState, useCallback } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Tag, Space, Typography, Card, Row, Col,
  message, Dropdown, Tooltip, Modal, Input, Select, DatePicker,
  Statistic, theme, InputNumber, Collapse, Badge,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DownOutlined, SendOutlined,
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined,
  FilePdfOutlined, LoadingOutlined, ReloadOutlined, SearchOutlined,
  FileExcelOutlined, FilterOutlined, CopyOutlined, ControlOutlined,
  EditOutlined, MailOutlined, FileTextOutlined, RightOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TableActions } from '../../components/ui/TableActions';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { facturasApi } from '../../api/facturas.api';
import { clientesApi } from '../../api/clientes.api';
import api from '../../api/client';
import { useCanDo } from '../../hooks/useCanDo';
import { exportarExcel } from '../../utils/exportExcel';
import type { Factura, FacturaEstado } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import EcfBadge, { type EstadoEcf } from '../../components/ui/EcfBadge';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS: FacturaEstado[] = ['borrador', 'emitida', 'pagada', 'cancelada'];

const TRANSICIONES: Record<FacturaEstado, FacturaEstado[]> = {
  borrador:  ['emitida', 'cancelada'],
  emitida:   ['pagada',  'cancelada'],
  pagada:    [],
  cancelada: [],
};

const ESTADO_ICON: Record<string, React.ReactNode> = {
  emitida:   <SendOutlined />,
  pagada:    <CheckCircleOutlined />,
  cancelada: <CloseCircleOutlined />,
};

const ESTADO_LABEL: Record<string, string> = {
  emitida:   'Emitir factura',
  pagada:    'Marcar pagada',
  cancelada: 'Cancelar',
};

async function descargarPDF(factura: Factura, setPending: (id: number | null) => void) {
  setPending(factura.id);
  try {
    const empresaId = localStorage.getItem('empresaId') ?? '';
    const res = await fetch(`/api/v1/facturas/${factura.id}/pdf`, {
      credentials: 'include',
      headers: { 'X-Empresa-ID': empresaId },
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${factura.folio}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    message.error('No se pudo generar el PDF');
  } finally {
    setPending(null);
  }
}

export default function FacturasPage() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const isMobile  = useMobile();

  // Permisos del rol activo
  const puedeCrear    = useCanDo('facturas:crear');
  const puedePDF      = useCanDo('facturas:pdf');
  const puedeDuplicar = useCanDo('facturas:duplicar');
  const puedeEliminar = useCanDo('facturas:eliminar');

  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [estado, setEstado]         = useState<string | undefined>();
  const [rango, setRango]           = useState<[Dayjs, Dayjs] | null>(null);
  const [pdfPending, setPdfPending] = useState<number | null>(null);
  const [emailFactura, setEmailFactura] = useState<Factura | null>(null);
  const [emailDestino, setEmailDestino] = useState('');
  // Filtros avanzados
  const [clienteId,  setClienteId]  = useState<number | undefined>();
  const [tipoPago,   setTipoPago]   = useState<string | undefined>();
  const [tipoNcf,    setTipoNcf]    = useState<string | undefined>();
  const [montoMin,   setMontoMin]   = useState<number | undefined>();
  const [montoMax,   setMontoMax]   = useState<number | undefined>();

  const filters = {
    search:    search || undefined,
    estado,
    desde:     rango?.[0].format('YYYY-MM-DD'),
    hasta:     rango?.[1].format('YYYY-MM-DD'),
    clienteId,
    tipoPago,
    tipoNcf,
    montoMin,
    montoMax,
  };

  const filtrosAvanzadosActivos = [clienteId, tipoPago, tipoNcf, montoMin, montoMax].filter(Boolean).length;

  // Clientes para el selector de filtro avanzado
  const { data: clientesData } = useQuery({
    queryKey: ['clientes-filter'],
    queryFn:  () => clientesApi.list(1, 200),
    staleTime: 5 * 60_000,
  });
  const clientesOpts = (clientesData?.data ?? []).map((c: any) => ({ value: c.id, label: c.nombre }));

  const { data, isLoading } = useQuery({
    queryKey:        ['facturas', page, filters],
    refetchOnMount:  'always',
    queryFn:         () => facturasApi.list(page, 15, filters),
    // Refrescar cada 5s si hay e-CFs en estado enviado/pendiente en la página actual
    refetchInterval: (query) => {
      const filas = (query.state.data as any)?.data ?? [];
      const hayPendiente = filas.some((f: any) =>
        ['enviado', 'pendiente_envio'].includes(f.ecf?.estadoDGII),
      );
      return hayPendiente ? 5_000 : false;
    },
  });

  // Resumen rápido desde la misma data cargada
  const resumen = data?.data ?? [];
  const totalPagina = resumen.reduce((s, f) => s + Number(f.total ?? 0), 0);

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: FacturaEstado }) =>
      facturasApi.cambiarEstado(id, estado),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); message.success('Estado actualizado'); },
    onError:   (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al cambiar estado'),
  });

  const reenviarEcfMut = useMutation({
    mutationFn: (numero: string) => facturasApi.reenviarEcf(numero),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); message.success('e-CF reenviado'); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al reenviar e-CF'),
  });

  const emitirEcfMut = useMutation({
    mutationFn: (id: number) => facturasApi.emitirEcfIndividual(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      qc.invalidateQueries({ queryKey: ['factura-ecf', id] });
      // Navegar al detalle para que el usuario vea el QR en tiempo real
      navigate(`/facturas/${id}`);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'No se pudo emitir el comprobante. Verifica la configuración e-CF.',
    ),
  });

  const deleteMut = useMutation({
    mutationFn: facturasApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['facturas'] }); message.success('Factura eliminada'); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar esta factura'),
  });

  const duplicarMut = useMutation({
    mutationFn: (id: number) => facturasApi.duplicar(id),
    onSuccess: (nueva: any) => {
      qc.invalidateQueries({ queryKey: ['facturas'] });
      message.success(`Factura duplicada → ${nueva?.folio ?? 'borrador'}`);
    },
    onError: () => message.error('Error al duplicar'),
  });

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/factura/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, vars) => {
      setEmailFactura(null); setEmailDestino('');
      message.success(`Factura enviada a ${vars.email}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al enviar email'),
  });

  const confirmarEliminar = (r: Factura) =>
    Modal.confirm({
      title: `¿Eliminar ${r.folio}?`,
      content: 'Esta acción no se puede deshacer.',
      okText: 'Eliminar', okType: 'danger',
      cancelText: 'Cancelar',
      onOk: () => deleteMut.mutate(r.id),
    });

  const handleExportExcel = useCallback(async () => {
    // Carga todas las facturas con los filtros actuales (hasta 1000)
    const all = await facturasApi.list(1, 1000, filters);
    const filas = (all?.data ?? []).map((f: Factura) => ({
      'Folio':      f.folio,
      'Fecha':      f.fecha ? dayjs(f.fecha).format('DD/MM/YYYY') : '',
      'Cliente':    (f as any).cliente?.nombre ?? 'Consumidor Final',
      'RNC':        (f as any).cliente?.rncReceptor ?? '',
      'Subtotal':   Number(f.subtotal ?? 0),
      'ITBIS':      Number(f.iva ?? 0),
      'Total':      Number(f.total ?? 0),
      'Estado':     f.estado,
      'NCF':        (f as any).ecf?.numero ?? '',
      'Vendedor':   (f as any).nombreVendedor ?? '',
    }));
    exportarExcel(filas, `Facturas-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} facturas exportadas`);
  }, [filters]);

  const limpiarFiltros = () => {
    setSearch(''); setEstado(undefined); setRango(null);
    setClienteId(undefined); setTipoPago(undefined); setTipoNcf(undefined);
    setMontoMin(undefined); setMontoMax(undefined);
    setPage(1);
  };

  const hayFiltros = !!(search || estado || rango || clienteId || tipoPago || tipoNcf || montoMin || montoMax);

  const COLS_DEF = [
    { key: 'folio',   label: 'Folio',   defaultVisible: true  },
    { key: 'fecha',   label: 'Fecha',   defaultVisible: true  },
    { key: 'cliente', label: 'Cliente', defaultVisible: true  },
    { key: 'total',   label: 'Total',   defaultVisible: true  },
    { key: 'moneda',  label: 'Moneda',  defaultVisible: true  },
    { key: 'estado',  label: 'Estado',  defaultVisible: true  },
    { key: 'ecf',     label: 'e-CF',    defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('facturas', COLS_DEF);

  const columns = [
    // ── Folio ──────────────────────────────────────────────────────────────────
    {
      title: 'Folio', key: 'folio', dataIndex: 'folio', width: 95, fixed: 'left' as const,
      render: (v: string) => (
        <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>
      ),
    },
    // ── Fecha ──────────────────────────────────────────────────────────────────
    {
      title: 'Fecha', key: 'fecha', dataIndex: 'fecha', width: 85,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.date(v)}</Text>,
    },
    // ── Cliente ────────────────────────────────────────────────────────────────
    {
      title: 'Cliente', key: 'cliente', dataIndex: ['cliente', 'nombre'], ellipsis: true, minWidth: 120,
      render: (v: string) => v
        ? <Text style={{ fontSize: 13 }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>Consumidor Final</Text>,
    },
    // Subtotal e ITBIS omitidos — disponibles en el detalle de la factura
    // ── Total ──────────────────────────────────────────────────────────────────
    {
      title: 'Total', key: 'total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: number, r: Factura) => (
        <Text strong style={{ fontSize: 13, color: token.colorPrimary }}>{fmt.moneyM(v, (r as any).moneda)}</Text>
      ),
    },
    // ── Moneda ─────────────────────────────────────────────────────────────────
    {
      title: 'Moneda', key: 'moneda', dataIndex: 'moneda', width: 68,
      render: (v: string) => {
        const m = v || 'DOP';
        const esDOP = m === 'DOP';
        return (
          <Tag
            color={esDOP ? 'default' : 'blue'}
            style={{ fontSize: 11, fontWeight: 600, margin: 0, fontFamily: 'monospace' }}
          >
            {m}
          </Tag>
        );
      },
    },
    // ── Estado ─────────────────────────────────────────────────────────────────
    {
      title: 'Estado', key: 'estado', dataIndex: 'estado', width: 90,
      render: (v: FacturaEstado) => (
        <Tag color={estadoColor[v]} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
    // ── e-CF — badge compacto + botón emitir/reenviar ─────────────────────────
    {
      title: 'e-CF', key: 'ecf', width: 160,
      render: (_: unknown, r: Factura) => {
        const ecf = (r as any).ecf;
        if (r.estado === 'borrador') return null;

        if (!ecf) {
          return (
            <Tooltip title="Emitir comprobante fiscal electrónico">
              <Button
                size="small" type="dashed" icon={<SendOutlined />}
                loading={emitirEcfMut.isPending && emitirEcfMut.variables === r.id}
                onClick={e => { e.stopPropagation(); emitirEcfMut.mutate(r.id); }}
                style={{ fontSize: 11 }}
              >
                Emitir
              </Button>
            </Tooltip>
          );
        }

        const puedeReenviar = ['rechazado', 'contingencia', 'pendiente_envio'].includes(ecf.estadoDGII);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Space size={4}>
              <EcfBadge estado={ecf.estadoDGII as EstadoEcf} encf={ecf.numero} small />
              {puedeReenviar && (
                <Tooltip title="Reenviar a DGII">
                  <Button
                    size="small" type="text" icon={<ReloadOutlined />}
                    loading={reenviarEcfMut.isPending}
                    onClick={e => { e.stopPropagation(); reenviarEcfMut.mutate(ecf.numero); }}
                  />
                </Tooltip>
              )}
            </Space>
            {ecf.numero && (
              <Tooltip title={ecf.numero}>
                <Typography.Text
                  copyable={{ text: ecf.numero }}
                  style={{ fontSize: 10, fontFamily: 'monospace', color: '#555', lineHeight: 1.2 }}
                >
                  {ecf.numero}
                </Typography.Text>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    // ── Acciones — ojo fijo + menú 3 puntos con todo lo demás ─────────────────
    {
      title: '', key: 'acciones', width: 72, align: 'right' as const, fixed: 'right' as const,
      render: (_: unknown, r: Factura) => {
        const siguientes = TRANSICIONES[r.estado];

        const menuItems = [
          {
            key: 'detalle', icon: <EyeOutlined />, label: 'Ver detalle',
            onClick: () => navigate(`/facturas/${r.id}`),
          },
          ...(r.estado === 'borrador' && puedeCrear ? [{
            key: 'editar', icon: <EditOutlined />, label: 'Editar',
            onClick: () => navigate(`/facturas/${r.id}/editar`),
          }] : []),
          ...(puedePDF ? [{
            key: 'pdf', icon: pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />,
            label: 'Descargar PDF',
            disabled: pdfPending === r.id,
            onClick: () => descargarPDF(r, setPdfPending),
          }] : []),
          ...(r.estado !== 'borrador' ? [{
            key: 'email', icon: <MailOutlined />, label: 'Enviar por email',
            onClick: () => { setEmailFactura(r); setEmailDestino((r as any).cliente?.email ?? ''); },
          }] : []),
          ...(puedeDuplicar ? [{
            key: 'duplicar', icon: <CopyOutlined />, label: 'Duplicar factura',
            onClick: () => duplicarMut.mutate(r.id),
          }] : []),
          ...(siguientes.length > 0 ? [{ type: 'divider' as const }] : []),
          ...siguientes.map(s => ({
            key: s,
            icon: ESTADO_ICON[s],
            label: ESTADO_LABEL[s],
            danger: s === 'cancelada',
            onClick: () => estadoMut.mutate({ id: r.id, estado: s }),
          })),
          ...(r.estado === 'borrador' && puedeEliminar ? [
            { type: 'divider' as const },
            {
              key: 'eliminar', icon: <DeleteOutlined />, label: 'Eliminar', danger: true,
              onClick: () => confirmarEliminar(r),
            },
          ] : []),
        ];

        return (
          <TableActions
            onView={() => navigate(`/facturas/${r.id}`)}
            items={menuItems}
            viewLabel="Ver factura"
          />
        );
      },
    },
  ];

  return (
    <Card>
      {/* ── Header ── */}
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Facturas</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} facturas
              {hayFiltros ? ' (filtradas)' : ''}
            </Text>
          )}
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={handleExportExcel}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['facturas']} />
            <VideoTutorialButton />
            {puedeCrear && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/facturas/nueva')}>
                Nueva factura
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* ── Búsqueda avanzada ── */}
      <div style={{ marginBottom: 16 }}>
        {/* Fila principal — siempre visible */}
        <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 8 }}>
          <Col xs={24} sm={12} md={9}>
            <Input
              placeholder="Buscar folio, cliente, RNC..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select placeholder="Estado" value={estado}
              onChange={v => { setEstado(v); setPage(1); }} allowClear style={{ width: '100%' }}>
              {ESTADOS.map(e => (
                <Option key={e} value={e}>
                  <Tag color={estadoColor[e]} style={{ margin: 0, fontSize: 11 }}>{e.toUpperCase()}</Tag>
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={6} md={7}>
            <RangePicker value={rango}
              onChange={v => { setRango(v as [Dayjs, Dayjs] | null); setPage(1); }}
              format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Desde', 'Hasta']} />
          </Col>
          <Col xs={24} sm={24} md={4} style={{ display: 'flex', gap: 6 }}>
            <Badge count={filtrosAvanzadosActivos} size="small">
              <Button
                icon={<ControlOutlined />}
                type={filtrosAvanzadosActivos > 0 ? 'primary' : 'default'}
                ghost={filtrosAvanzadosActivos > 0}
                onClick={() => {/* toggle handled by Collapse below */}}
                style={{ pointerEvents: 'none' }}
              >
                Avanzado
              </Button>
            </Badge>
            {hayFiltros && (
              <Button type="text" size="small" icon={<FilterOutlined />} onClick={limpiarFiltros}>
                Limpiar
              </Button>
            )}
          </Col>
        </Row>

        {/* Panel avanzado — siempre expandido cuando hay filtros avanzados activos */}
        <Collapse
          ghost
          size="small"
          defaultActiveKey={filtrosAvanzadosActivos > 0 ? ['adv'] : []}
          items={[{
            key: 'adv',
            label: (
              <Space size={4}>
                <ControlOutlined />
                <span style={{ fontSize: 13 }}>Filtros avanzados</span>
                {filtrosAvanzadosActivos > 0 && (
                  <Badge count={filtrosAvanzadosActivos} style={{ background: token.colorPrimary }} />
                )}
              </Space>
            ),
            children: (
              <Row gutter={[12, 12]} style={{ paddingBottom: 8 }}>
                <Col xs={24} sm={12} md={8}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>Cliente</div>
                  <Select
                    showSearch
                    allowClear
                    placeholder="Todos los clientes"
                    style={{ width: '100%' }}
                    value={clienteId}
                    onChange={v => { setClienteId(v); setPage(1); }}
                    filterOption={(input, opt) =>
                      String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={clientesOpts}
                  />
                </Col>
                <Col xs={12} sm={6} md={4}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>Tipo de pago</div>
                  <Select allowClear placeholder="Todos" style={{ width: '100%' }}
                    value={tipoPago} onChange={v => { setTipoPago(v); setPage(1); }}>
                    <Option value="CONTADO">Contado</Option>
                    <Option value="CREDITO">Crédito</Option>
                  </Select>
                </Col>
                <Col xs={12} sm={6} md={4}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>Tipo NCF</div>
                  <Select allowClear placeholder="Todos" style={{ width: '100%' }}
                    value={tipoNcf} onChange={v => { setTipoNcf(v); setPage(1); }}>
                    {['E31','E32','E33','E34','E41','E43','E44','E45','E46','E47'].map(t => (
                      <Option key={t} value={t}>{t}</Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={12} sm={6} md={4}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>Monto mínimo (RD$)</div>
                  <InputNumber
                    placeholder="0"
                    style={{ width: '100%' }}
                    min={0}
                    value={montoMin}
                    onChange={v => { setMontoMin(v ?? undefined); setPage(1); }}
                    formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={(v: any) => v?.replace(/,/g, '')}
                  />
                </Col>
                <Col xs={12} sm={6} md={4}>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>Monto máximo (RD$)</div>
                  <InputNumber
                    placeholder="Sin límite"
                    style={{ width: '100%' }}
                    min={0}
                    value={montoMax}
                    onChange={v => { setMontoMax(v ?? undefined); setPage(1); }}
                    formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={(v: any) => v?.replace(/,/g, '')}
                  />
                </Col>
              </Row>
            ),
          }]}
        />
      </div>


      {/* ── Modal enviar por email ── */}
      <Modal
        title={<><MailOutlined style={{ color: '#1677ff', marginRight: 8 }} />Enviar factura por email</>}
        open={!!emailFactura}
        onCancel={() => { setEmailFactura(null); setEmailDestino(''); }}
        onOk={() => emailFactura && emailMut.mutate({ id: emailFactura.id, email: emailDestino })}
        confirmLoading={emailMut.isPending}
        okText="Enviar"
        okButtonProps={{ disabled: !emailDestino }}
        destroyOnHidden
        width={420}
      >
        {emailFactura && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
              Factura <strong>{emailFactura.folio}</strong>
              {(emailFactura as any).cliente?.nombre
                ? <> · Cliente: <strong>{(emailFactura as any).cliente.nombre}</strong></>
                : ' · Consumidor Final'
              }
            </p>
            <Input
              prefix={<MailOutlined />}
              placeholder="correo@cliente.com"
              value={emailDestino}
              onChange={e => setEmailDestino(e.target.value)}
              size="large"
              type="email"
            />
          </div>
        )}
      </Modal>

      {/* ── Vista mobile: cards ── */}
      {isMobile ? (
        <div>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center' }}><span>Cargando...</span></div>
          ) : resumen.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: token.colorTextSecondary }}>
              Sin facturas
            </div>
          ) : (
            resumen.map((f) => (
              <div
                key={f.id}
                onClick={() => navigate(`/facturas/${f.id}`)}
                style={{
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 10,
                  background: token.colorBgContainer, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 8, background: '#EFF6FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileTextOutlined style={{ color: '#0EA5E9', fontSize: 18 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <Text strong style={{ fontSize: 13 }} ellipsis>
                      {(f as any).cliente?.nombre ?? 'Consumidor Final'}
                    </Text>
                    <Text strong style={{ fontSize: 13, color: token.colorPrimary, flexShrink: 0 }}>
                      {fmt.moneyM(Number(f.total ?? 0), (f as any).moneda)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'monospace', color: token.colorTextSecondary }}>
                      {f.folio}
                    </Text>
                    <Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                      {f.fecha ? dayjs(f.fecha).format('DD/MM/YY') : ''}
                    </Text>
                    <Tag
                      color={estadoColor[f.estado]}
                      style={{ fontSize: 10, margin: 0, padding: '0 6px' }}
                    >
                      {f.estado?.toUpperCase()}
                    </Tag>
                  </div>
                </div>
                <RightOutlined style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
              </div>
            ))
          )}
          {data?.meta && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Space>
                <Button size="small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</Button>
                <Text style={{ fontSize: 12 }}>{page} / {Math.ceil((data.meta.total ?? 0) / 15)}</Text>
                <Button size="small" disabled={page * 15 >= (data.meta.total ?? 0)} onClick={() => setPage(p => p + 1)}>Siguiente ›</Button>
              </Space>
            </div>
          )}
        </div>
      ) : (
        /* ── Tabla — scroll interno para que la página no desborde ── */
        <Table
          columns={filterColumns(columns)}
          dataSource={resumen}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          onRow={r => ({
            style: { cursor: 'pointer' },
            onDoubleClick: () => navigate(`/facturas/${r.id}`),
          })}
          pagination={{
            total:         data?.meta.total,
            pageSize:      15,
            current:       page,
            onChange:      (p) => setPage(p),
            showTotal:     (t) => `${t.toLocaleString('es-DO')} facturas`,
            showSizeChanger: false,
            size:          'small',
          }}
        />
      )}
    </Card>
  );
}
