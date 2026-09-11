import { useState, useCallback } from 'react';
import { EmailConCopiaModal } from '../../components/ui/EmailConCopiaModal';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Table, Button, Tag, Space, Typography, Card, Row, Col,
  Popconfirm, message, Dropdown, Input, Select, DatePicker, Statistic, theme,
  Modal, Tooltip,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DownOutlined, SearchOutlined,
  FileExcelOutlined, FilterOutlined, MailOutlined, PrinterOutlined,
  LoadingOutlined, AuditOutlined, CopyOutlined, CheckCircleOutlined, EditOutlined,
} from '@ant-design/icons';
import { SolicitarAprobacionModal } from '../../components/ui/SolicitarAprobacionModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useCanDo } from '../../hooks/useCanDo';
import { TableActions } from '../../components/ui/TableActions';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { comprasApi } from '../../api/compras.api';
import api from '../../api/client';
import { ecfApi } from '../../api/ecf.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Compra, CompraEstado } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';
import EcfResultModal from '../../components/ui/EcfResultModal';
import EcfBadge, { type EstadoEcf } from '../../components/ui/EcfBadge';
import RecibirMercanciaModal from '../../components/compras/RecibirMercanciaModal';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS_COMPRA: CompraEstado[] = ['borrador', 'enviada', 'recibida_parcial', 'recibida', 'pagada', 'cancelada'];

export default function ComprasPage() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const puedeCrear    = useCanDo('compras:crear');
  const puedeEliminar = useCanDo('compras:eliminar');

  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [estado, setEstado]     = useState<string | undefined>();
  const [rango, setRango]       = useState<[Dayjs, Dayjs] | null>(null);
  const [emailCompra,  setEmailCompra]  = useState<any>(null);
  const [ecfEncf,      setEcfEncf]      = useState<string | null>(null);
  const [aprobCompra,  setAprobCompra]  = useState<any>(null);
  // Recibir mercancía: la fila de la tabla no trae `detalles` (findAll no los
  // selecciona) — hay que pedir la compra completa antes de poder mostrar el
  // modal con cantidades por línea. Mismo modal que usa el POS — una sola
  // fuente de verdad, ver components/compras/RecibirMercanciaModal.tsx.
  const [recibirCompra,   setRecibirCompra]   = useState<Compra | null>(null);
  const [cargandoRecibir, setCargandoRecibir] = useState<number | null>(null);

  const filters = {
    search: search || undefined,
    estado,
    desde: rango?.[0].format('YYYY-MM-DD'),
    hasta: rango?.[1].format('YYYY-MM-DD'),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['compras', page, filters],
    refetchOnMount: 'always',
    queryFn:  () => comprasApi.list(page, 10, filters),
  });

  const rows = data?.data ?? [];
  const [pdfPending, setPdfPending] = useState<number | null>(null);

  const imprimirPDF = async (compra: Compra) => {
    setPdfPending(compra.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/compras/${compra.id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) throw new Error('Error PDF');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { message.warning('El navegador bloqueó la ventana emergente'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch { message.error('No se pudo generar el PDF'); }
    finally { setPdfPending(null); }
  };
  const totalPag = rows.reduce((s, c) => s + Number(c.total ?? 0), 0);

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: CompraEstado }) =>
      comprasApi.cambiarEstado(id, estado),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Estado actualizado'); },
    onError:   (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  /**
   * Abre el modal de recepción — pide la compra completa (con detalles) antes,
   * porque la fila de la tabla no los trae. "Recibir" en borrador/enviada y
   * "Completar" en recibida_parcial usan exactamente este mismo camino.
   */
  const abrirRecibir = async (id: number) => {
    setCargandoRecibir(id);
    try {
      const full = await comprasApi.getOne(id);
      setRecibirCompra(full);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'No se pudo cargar la orden de compra');
    } finally {
      setCargandoRecibir(null);
    }
  };

  const deleteMut = useMutation({
    mutationFn: comprasApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Compra eliminada'); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar'),
  });

  const duplicarMut = useMutation({
    mutationFn: (id: number) => api.post(`/compras/${id}/duplicar`).then(r => r.data?.data ?? r.data),
    onSuccess: (nueva: any) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      message.success(`Compra duplicada → ${nueva?.folio ?? 'borrador'}`);
    },
    onError: (e: any) => message.error(e?.friendlyMessage ?? 'Error al duplicar'),
  });

  const emitirEcfE41 = useMutation({
    mutationFn: (id: number) => ecfApi.emitirEcfCompra(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      if (res?.encf) setEcfEncf(res.encf);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al emitir e-CF E41',
    ),
  });

  const handleEmitirE41 = async (id: number) => {
    const ecfExistente = await ecfApi.getEcfByDocumento(id, 'COMPRA').catch(() => null);
    const ESTADOS_DEFINITIVOS = ['aceptado', 'enviado', 'pendiente_envio', 'observado', 'condicionado'];
    if (ecfExistente && ESTADOS_DEFINITIVOS.includes(ecfExistente.estadoDGII ?? '')) {
      message.warning(`Ya existe un Comprobante E41 emitido para esta orden: ${ecfExistente.numero}. No se creará un duplicado.`);
      if (ecfExistente.numero) setEcfEncf(ecfExistente.numero);
      return;
    }
    emitirEcfE41.mutate(id);
  };

  const emailMut = useMutation({
    mutationFn: ({ id, email, cc, cco }: { id: number; email: string; cc?: string; cco?: string }) =>
      api.post(`/notificaciones/compra/${id}/enviar`, { email, cc, cco }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailCompra(null); message.success(`Orden enviada a ${v.email}`); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar'),
  });

  const handleExcel = useCallback(async () => {
    const all = await comprasApi.list(1, 1000, filters);
    const filas = (all?.data ?? []).map((c: Compra) => ({
      'Folio':      c.folio,
      'Fecha':      c.fecha ? dayjs(c.fecha).format('DD/MM/YYYY') : '',
      'Proveedor':  (c as any).proveedor?.nombre ?? '',
      'RNC':        (c as any).proveedor?.rnc ?? '',
      'Subtotal':   Number(c.subtotal ?? 0),
      'ITBIS':      Number(c.itbis ?? 0),
      'Total':      Number(c.total ?? 0),
      'Estado':     c.estado,
    }));
    exportarExcel(filas, `Compras-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} compras exportadas`);
  }, [filters]);

  const limpiar = () => { setSearch(''); setEstado(undefined); setRango(null); setPage(1); };
  const hayFiltros = !!(search || estado || rango);

  const COLS_DEF = [
    { key: 'folio',     label: 'Folio',        defaultVisible: true  },
    { key: 'fecha',     label: 'Fecha',        defaultVisible: true  },
    { key: 'proveedor', label: 'Proveedor',    defaultVisible: true  },
    { key: 'ncf',       label: 'NCF Proveedor',defaultVisible: false },
    { key: 'tipoPago',  label: 'Tipo Pago',    defaultVisible: true  },
    { key: 'moneda',    label: 'Moneda',       defaultVisible: true  },
    { key: 'total',     label: 'Total',        defaultVisible: true  },
    { key: 'estado',    label: 'Estado',       defaultVisible: true  },
    { key: 'ecf',       label: 'e-CF',         defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('compras', COLS_DEF);

  const columns = [
    {
      title: 'Folio', key: 'folio', dataIndex: 'folio', width: 95, fixed: 'left' as const,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Fecha', key: 'fecha', dataIndex: 'fecha', width: 88,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.date(v)}</Text>,
    },
    {
      title: 'Proveedor', key: 'proveedor', dataIndex: ['proveedor', 'nombre'], ellipsis: true, minWidth: 120,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'NCF Proveedor', key: 'ncf', dataIndex: 'numeroFacturaProveedor', width: 130,
      render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tipo Pago', key: 'tipoPago', dataIndex: 'tipoPago', width: 90,
      render: (v: string) => (
        <Tag color={v === 'contado' ? 'green' : 'blue'} style={{ fontSize: 11, margin: 0 }}>
          {v === 'contado' ? 'Contado' : 'Crédito'}
        </Tag>
      ),
    },
    {
      title: 'Moneda', key: 'moneda', dataIndex: 'moneda', width: 72,
      render: (v: string) => {
        const m = v || 'DOP';
        return <Tag color={m === 'USD' ? 'gold' : m === 'EUR' ? 'purple' : 'default'} style={{ fontSize: 11, fontWeight: 600, margin: 0, fontFamily: 'monospace' }}>{m}</Tag>;
      },
    },
    {
      title: 'Total', key: 'total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: number, r: any) => {
        const m = (r as any).moneda ?? 'DOP';
        const sym = m === 'USD' ? 'US$' : m === 'EUR' ? '€' : 'RD$';
        return <Text strong style={{ color: token.colorPrimary }}>{sym} {Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</Text>;
      },
    },
    {
      title: 'Estado', key: 'estado', dataIndex: 'estado', width: 90,
      render: (v: CompraEstado) => (
        <Tag color={estadoColor[v]} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'e-CF', key: 'ecf', width: 160,
      render: (_: unknown, r: Compra) => {
        const ecfNum = (r as any).ecfNumero;
        const ecfEst = (r as any).ecfEstado;
        const ncfProv = (r as any).numeroFacturaProveedor;

        // E41 propio emitido → mostrar con badge DGII
        if (ecfNum) {
          return (
            <div>
              <EcfBadge estado={(ecfEst ?? 'pendiente') as EstadoEcf} encf={ecfNum} small />
            </div>
          );
        }

        // NCF del proveedor como referencia secundaria
        if (ncfProv) {
          return (
            <div>
              <Text type="secondary" style={{ fontSize: 10 }}>NCF Prov.</Text>
              <br />
              <Text code style={{ fontSize: 11 }}>{ncfProv}</Text>
            </div>
          );
        }

        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: '', key: 'actions', width: 110, align: 'right' as const,
      render: (_: unknown, r: Compra) => {
        // Mismas acciones que el POS ofrece por estado — un solo flujo de
        // recepción, con verificación de cantidades y soporte de recepción
        // parcial (ver RecibirMercanciaModal). "Recibir mercancía" ya NO
        // cambia el estado de un tirón: abre el modal.
        const recibiendoEsta = cargandoRecibir === r.id;
        const itemRecibir = {
          key: 'recibir',
          label: recibiendoEsta ? 'Cargando...' : '📦 Recibir mercancía',
          disabled: recibiendoEsta,
          onClick: () => abrirRecibir(r.id),
        };
        const itemCompletar = {
          key: 'completar',
          label: recibiendoEsta ? 'Cargando...' : '📦 Completar recepción',
          disabled: recibiendoEsta,
          onClick: () => abrirRecibir(r.id),
        };
        const itemCancelar = {
          key: 'cancelada', label: '❌ Cancelar', danger: true,
          onClick: () => estadoMut.mutate({ id: r.id, estado: 'cancelada' as CompraEstado }),
        };
        const items =
          r.estado === 'borrador' ? [
            { key: 'enviada', label: '📤 Marcar enviada', onClick: () => estadoMut.mutate({ id: r.id, estado: 'enviada' as CompraEstado }) },
            itemCancelar,
          ]
          : r.estado === 'enviada' ? [itemRecibir, itemCancelar]
          : r.estado === 'recibida_parcial' ? [itemCompletar, itemCancelar]
          : r.estado === 'recibida' ? [
              { key: 'pagada', label: '✅ Marcar pagada', onClick: () => estadoMut.mutate({ id: r.id, estado: 'pagada' as CompraEstado }) },
              itemCancelar,
            ]
          : [];
        const menuItems2 = [
          // «Editar» solo en borrador, y encabezando el menú: es lo primero que
          // se busca en una orden a medio hacer. En cualquier otro estado el
          // backend lo rechaza, así que no se ofrece.
          ...(r.estado === 'borrador' ? [
            { key: 'editar', label: 'Editar compra', icon: <EditOutlined />, onClick: () => navigate(`/compras/${r.id}/editar`) },
          ] : []),
          { key: 'pdf', label: pdfPending === r.id ? 'Generando...' : 'Imprimir', icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />, disabled: pdfPending === r.id, onClick: () => imprimirPDF(r) },
          { key: 'email', label: 'Enviar email al proveedor', icon: <MailOutlined />, onClick: () => { setEmailCompra(r); } },
          { key: 'duplicar', label: 'Duplicar compra', icon: <CopyOutlined />, onClick: () => duplicarMut.mutate(r.id) },
          ...(r.estado === 'borrador' ? [
            { type: 'divider' as const },
            { key: 'solicitar-aprobacion', label: <><CheckCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />Solicitar aprobación</>, onClick: () => setAprobCompra(r) },
          ] : []),
          ...items,
          ...((r.estado === 'recibida' || r.estado === 'pagada') && (!(r as any).proveedor?.rnc || (r as any).proveedor?.esInformal) ? [
            { type: 'divider' as const },
            { key: 'e41', label: 'Emitir Comprobante E41', icon: <AuditOutlined />, onClick: () => handleEmitirE41(r.id) },
          ] : []),
          ...(r.estado === 'borrador' && puedeEliminar ? [
            { type: 'divider' as const },
            { key: 'eliminar', label: 'Eliminar', danger: true, onClick: () => deleteMut.mutate(r.id) },
          ] : []),
        ];
        return (
          <TableActions
            onView={() => navigate(`/compras/${r.id}`)}
            viewLabel="Ver detalle de compra"
            items={menuItems2}
          />
        );
      },
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Órdenes de Compra</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} compras{hayFiltros ? ' (filtradas)' : ''}
            </Text>
          )}
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['compras']} />
            <VideoTutorialButton />
            {puedeCrear && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/compras/nueva')}>
                Nueva compra
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* Filtros */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }} align="middle">
        <Col xs={24} sm={10} md={8}>
          <Input
            placeholder="Buscar folio, proveedor, RNC..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col xs={24} sm={6} md={4}>
          <Select placeholder="Estado" value={estado}
            onChange={v => { setEstado(v); setPage(1); }} allowClear style={{ width: '100%' }}>
            {ESTADOS_COMPRA.map(e => (
              <Option key={e} value={e}>
                <Tag color={estadoColor[e]} style={{ margin: 0, fontSize: 11 }}>{e.toUpperCase()}</Tag>
              </Option>
            ))}
          </Select>
        </Col>
        <Col xs={24} sm={8} md={8}>
          <RangePicker value={rango} onChange={v => { setRango(v as [Dayjs, Dayjs] | null); setPage(1); }}
            format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Desde', 'Hasta']} />
        </Col>
        {hayFiltros && (
          <Col>
            <Button type="text" size="small" icon={<FilterOutlined />} onClick={limpiar}>Limpiar</Button>
          </Col>
        )}
      </Row>


      <Table
        columns={filterColumns(columns as any) as any} dataSource={rows} rowKey="id"
        loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        onRow={r => ({ style: { cursor: 'pointer' }, onDoubleClick: () => navigate(`/compras/${r.id}`) })}
        pagination={{
          total: data?.meta.total, pageSize: 10, current: page,
          onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} compras`,
          showSizeChanger: false, size: 'small',
        }}
      />

      {/* Modal email proveedor */}
      <EmailConCopiaModal
        open={!!emailCompra}
        title={<><MailOutlined style={{ color: '#7c3aed', marginRight: 8 }} />Enviar orden al proveedor</>}
        documentoInfo={emailCompra ? <>Orden <strong>{emailCompra.folio}</strong> · Proveedor: <strong>{(emailCompra as any).proveedor?.nombre ?? '—'}</strong></> : undefined}
        onCancel={() => setEmailCompra(null)}
        onEnviar={p => emailCompra && emailMut.mutate({ id: emailCompra.id, ...p })}
        loading={emailMut.isPending}
        okText="Enviar orden"
      />

      {aprobCompra && (
        <SolicitarAprobacionModal
          open={!!aprobCompra}
          onClose={() => setAprobCompra(null)}
          tipo="compra"
          entidadId={aprobCompra.id}
          entidadRef={aprobCompra.folio}
          monto={aprobCompra.total}
        />
      )}

      <EcfResultModal encf={ecfEncf} onClose={() => setEcfEncf(null)} />

      <RecibirMercanciaModal
        open={!!recibirCompra}
        compra={recibirCompra}
        onClose={() => setRecibirCompra(null)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['compras'] });
          message.success('Mercancía recibida y stock actualizado');
        }}
      />
    </Card>
  );
}
