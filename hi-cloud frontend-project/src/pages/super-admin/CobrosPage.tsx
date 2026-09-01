import { useEffect, useState } from 'react';
import {
  Table, Card, Row, Col, Typography, Tag, Button, Space,
  Modal, Form, Input, InputNumber, Select, message, Popconfirm,
  Tabs, Badge, Descriptions, Image, Statistic,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, DollarOutlined,
  PlusOutlined, MinusOutlined, BellOutlined,
  BankOutlined, SettingOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pagosAdminApi, PagoSuscripcion, PreviewPago, ResumenCobros } from '../../api/pagos.api';
import { fmtDop } from '../../utils/fmt';
import { ahora, diasHasta, fecha } from '../../utils/fechaRD';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';

const { Title, Text } = Typography;

function fmtDate(d: string | null) {
  if (!d) return '—';
  return fecha(d);
}

const PLAN_LABELS:  Record<string, string> = { emprendedor: 'Emprendedor', pyme: 'PYME', pro: 'Pro', plus: 'Plus' };

/**
 * El texto del aviso a partir del preview que manda el backend.
 *
 * Aquí ya no se calcula nada: `periodos`, `nuevaFecha` y `faltante` vienen
 * hechos del servidor con la misma fórmula que se aplicará al confirmar. Esta
 * pantalla solo elige las palabras y el color.
 *
 * `corto` es para el Popconfirm, donde no cabe la frase entera.
 */
function avisoPreview(p: PreviewPago | null | undefined, corto = false): { texto: string; tono: 'ok' | 'aviso' | 'malo' } | null {
  if (!p) return null;
  if (p.sinSuscripcion) return { texto: 'Esta empresa no tiene suscripción: el pago queda como abono.', tono: 'aviso' };
  if (p.sinPrecio)      return { texto: 'El plan no tiene precio configurado: el pago será rechazado.', tono: 'malo' };
  if (p.periodos === 0) return {
    texto: corto
      ? `⚠️ No extiende la suscripción. Faltan ${fmtDop(p.faltante)} para un período.`
      : `⚠️ Este pago NO extiende la suscripción. Faltan ${fmtDop(p.faltante)} para completar un período.`,
    tono: 'aviso',
  };
  const hasta = fecha(p.nuevaFecha);
  if (p.enPasado) return {
    texto: `🔴 Queda vencida hasta ${hasta}. Este pago cubre ${p.periodos} período(s).`,
    tono: 'malo',
  };
  return {
    texto: corto
      ? `✅ Cubre ${p.periodos} período(s). Nuevo vencimiento: ${hasta}`
      : `✅ Este pago cubre ${p.periodos} período(s). Nuevo vencimiento: ${hasta}`,
    tono: 'ok',
  };
}

const TONO_AVISO = {
  ok:    { fondo: '#f0fdf4', borde: '#86efac', texto: '#166534' },
  aviso: { fondo: '#fefce8', borde: '#fde047', texto: '#854d0e' },
  malo:  { fondo: '#fef2f2', borde: '#fca5a5', texto: '#991b1b' },
} as const;

const ESTADO_COLOR: Record<string, string> = {
  activa: 'green', suspendida: 'red', prueba: 'cyan', vencida: 'red', cancelada: 'default',
};
const PLAN_COLOR: Record<string, string> = {
  emprendedor: 'blue', pyme: 'green', pro: 'purple', plus: 'gold',
};

export default function CobrosPage() {
  const qc = useQueryClient();

  const [openPago,         setOpenPago]         = useState<number | null>(null);  // empresaId
  const [pagoPreviewMonto, setPagoPreviewMonto] = useState<number | null>(null);
  // El monto con el que se le pregunta al servidor. Va detrás del que se
  // teclea para no lanzar una petición por tecla.
  const [montoConsultado,  setMontoConsultado]  = useState<number | null>(null);
  const [openCargo,        setOpenCargo]        = useState<number | null>(null);
  const [openCredito,      setOpenCredito]      = useState<number | null>(null);
  const [openHist,         setOpenHist]         = useState<number | null>(null);
  const [openBanco,        setOpenBanco]        = useState(false);
  const [openRechazo,      setOpenRechazo]      = useState<number | null>(null);  // pagoId
  const [openComprobante,  setOpenComprobante]  = useState<PagoSuscripcion | null>(null);

  const [formPago]    = Form.useForm();
  const [formCargo]   = Form.useForm();
  const [formCredito] = Form.useForm();
  const [formBanco]   = Form.useForm();
  const [formRechazo] = Form.useForm();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: resumenRaw, isLoading: loadRes } = useQuery({
    queryKey: ['cobros-resumen'],
    queryFn:  pagosAdminApi.resumenCobros,
  });
  const resumen: ResumenCobros[] = Array.isArray(resumenRaw) ? resumenRaw : [];

  const { data: pendientesRaw, isLoading: loadPend } = useQuery({
    queryKey: ['comprobantes-pendientes'],
    queryFn:  pagosAdminApi.comprobantesPendientes,
  });
  const pendientes: PagoSuscripcion[] = Array.isArray(pendientesRaw) ? pendientesRaw : [];

  const { data: histEmpresaRaw } = useQuery({
    queryKey: ['hist-empresa', openHist],
    queryFn:  () => pagosAdminApi.historialEmpresa(openHist!),
    enabled:  !!openHist,
  });
  const histEmpresa: PagoSuscripcion[] = Array.isArray(histEmpresaRaw) ? histEmpresaRaw : [];

  const { data: configBanco } = useQuery({
    queryKey: ['config-bancaria-admin'],
    queryFn:  pagosAdminApi.getConfigBancaria,
  });

  useEffect(() => {
    const t = setTimeout(() => setMontoConsultado(pagoPreviewMonto), 350);
    return () => clearTimeout(t);
  }, [pagoPreviewMonto]);

  /**
   * Qué haría este pago, según el servidor.
   *
   * Es la misma fórmula que se aplica al registrar (preview-pago.util.ts). El
   * frontend la tenía copiada y le prometía al admin un vencimiento que el
   * backend recalculaba después — mismo criterio que el efectivo esperado del
   * cierre de caja: aquí no se calcula dinero, se muestra lo que llega.
   */
  const { data: previewPago, isFetching: previewCargando } = useQuery({
    queryKey: ['preview-pago', openPago, montoConsultado],
    queryFn:  () => pagosAdminApi.previewPago(openPago!, montoConsultado!),
    enabled:  !!openPago && montoConsultado != null && montoConsultado > 0,
  });

  // Mientras el monto tecleado no sea el que se consultó, el aviso de abajo
  // hablaría de otra cifra. Antes que enseñar un número que ya no es, se dice
  // que se está calculando.
  const previewAlDia = pagoPreviewMonto === montoConsultado && !previewCargando;

  // ── Mutations ────────────────────────────────────────────────────────────
  const pagoMut = useMutation({
    mutationFn: ({ id, ...d }: any) => pagosAdminApi.registrarPago(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros-resumen'] });
      setOpenPago(null); setPagoPreviewMonto(null); setMontoConsultado(null); formPago.resetFields();
      message.success('Pago registrado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cargoMut = useMutation({
    mutationFn: ({ id, ...d }: any) => pagosAdminApi.agregarCargo(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cobros-resumen'] }); setOpenCargo(null); formCargo.resetFields(); message.success('Cargo agregado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const creditoMut = useMutation({
    mutationFn: ({ id, ...d }: any) => pagosAdminApi.aplicarCredito(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cobros-resumen'] }); setOpenCredito(null); formCredito.resetFields(); message.success('Crédito aplicado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const confirmarMut = useMutation({
    mutationFn: (pagoId: number) => pagosAdminApi.confirmar(pagoId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comprobantes-pendientes'] }); qc.invalidateQueries({ queryKey: ['cobros-resumen'] }); message.success('Transferencia confirmada ✅'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const rechazarMut = useMutation({
    mutationFn: ({ pagoId, motivo }: any) => pagosAdminApi.rechazar(pagoId, motivo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comprobantes-pendientes'] }); setOpenRechazo(null); formRechazo.resetFields(); message.success('Transferencia rechazada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const recordatorioMut = useMutation({
    mutationFn: (id: number) => pagosAdminApi.enviarRecordatorio(id),
    onSuccess: (data) => message.success(data.mensaje),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const bancMut = useMutation({
    mutationFn: (d: any) => pagosAdminApi.updateConfigBancaria(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config-bancaria-admin'] }); setOpenBanco(false); message.success('Configuración bancaria actualizada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  // ── Columnas tabla resumen ────────────────────────────────────────────────
  const COLS_RESUMEN = [
    { key: 'nombre',                 label: 'Empresa'     },
    { key: 'plan',                   label: 'Plan'        },
    { key: 'estadoSuscripcion',      label: 'Suscripción' },
    { key: 'venceSuscripcion',       label: 'Vencimiento' },
    { key: 'saldo',                  label: 'Saldo'       },
    { key: 'ultimoPago',             label: 'Último pago' },
    { key: 'pendientesConfirmacion', label: 'Pendientes'  },
  ];
  const colVisResumen = useColumnVisibility('sa-cobros-resumen', COLS_RESUMEN);

  const COLS_PENDIENTES = [
    { key: 'empresaNombre',  label: 'Empresa'     },
    { key: 'monto',          label: 'Monto'       },
    { key: 'referencia',     label: 'Referencia'  },
    { key: 'creadoEn',       label: 'Fecha'       },
    { key: 'notas',          label: 'Notas'       },
    { key: 'comprobanteUrl', label: 'Comprobante' },
  ];
  const colVisPendientes = useColumnVisibility('sa-cobros-pendientes', COLS_PENDIENTES);

  const COLS_HIST = [
    { key: 'creadoEn', label: 'Fecha'    },
    { key: 'concepto', label: 'Concepto' },
    { key: 'tipo',     label: 'Tipo'     },
    { key: 'monto',    label: 'Monto'    },
    { key: 'estado',   label: 'Estado'   },
  ];
  const colVisHist = useColumnVisibility('sa-cobros-historial', COLS_HIST);

  /**
   * El nombre de la empresa, que es lo que el admin reconoce.
   *
   * Los títulos decían "Empresa #42": el id no le dice nada a nadie y es lo
   * primero que se lee al confirmar un cargo.
   */
  const nombreEmpresa = (id: number | null) =>
    resumen.find(r => r.empresaId === id)?.nombre ?? (id ? `Empresa #${id}` : '');

  /**
   * Cerrar un modal deja el formulario limpio.
   *
   * Antes solo se limpiaba en onSuccess: abrir → escribir → cancelar → abrir
   * con OTRA empresa arrastraba el concepto y el monto anteriores. En una
   * pantalla de cargos y créditos eso le aplica dinero a quien no es.
   */
  const cerrar = (setOpen: (v: null) => void, form: { resetFields: () => void }) => () => {
    setOpen(null);
    form.resetFields();
  };

  const colsResumen = [
    {
      title: 'Empresa',
      dataIndex: 'nombre',
      key: 'nombre',
      render: (v: string, r: ResumenCobros) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
        </Space>
      ),
    },
    {
      title: 'Plan',
      dataIndex: 'plan',
      key: 'plan',
      width: 110,
      render: (v: string) => (
        <Tag color={PLAN_COLOR[v] ?? 'default'}>
          {(v ?? '').charAt(0).toUpperCase() + (v ?? '').slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Suscripción',
      dataIndex: 'estadoSuscripcion',
      key: 'estadoSuscripcion',
      width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{(v ?? '').toUpperCase()}</Tag>,
    },
    {
      title: 'Vencimiento',
      dataIndex: 'venceSuscripcion',
      key: 'venceSuscripcion',
      width: 130,
      render: (v: string) => {
        // Un vencimiento es una fecha de calendario. Restarle Date.now() a
        // `new Date('2026-08-31')` lo lee como medianoche UTC y en RD (−4) da
        // un día menos; diasHasta cuenta días en RD. Vencer HOY tampoco es
        // estar vencida: la suscripción vale todo el día.
        const dias = diasHasta(v);
        return (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <Text>{fmtDate(v)}</Text>
            </Space>
            {dias !== null && (
              <Text style={{ fontSize: 11, color: dias <= 3 ? '#ef4444' : dias <= 7 ? '#f59e0b' : '#6b7280' }}>
                {dias > 0 ? `${dias}d` : dias === 0 ? 'Vence hoy' : 'Vencida'}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
      key: 'saldo',
      width: 120,
      align: 'right' as const,
      render: (v: number | string) => {
        const saldo = Number(v ?? 0);
        if (saldo > 0)
          return <Text strong style={{ color: '#ef4444' }}>{fmtDop(saldo)}</Text>;
        if (saldo < 0)
          return (
            <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
              <Text strong style={{ color: '#10b981' }}>{fmtDop(Math.abs(saldo))}</Text>
              <Text style={{ fontSize: 10, color: '#10b981' }}>a favor</Text>
            </Space>
          );
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Último pago',
      dataIndex: 'ultimoPago',
      key: 'ultimoPago',
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Pendientes',
      dataIndex: 'pendientesConfirmacion',
      key: 'pendientesConfirmacion',
      width: 90,
      render: (v: number) =>
        v > 0 ? <Badge count={v} color="orange" /> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 220,
      render: (_: any, r: ResumenCobros) => (
        <Space size={4} wrap>
          <Button size="small" icon={<DollarOutlined />}
            onClick={() => {
              const precio = r.precioMensual ?? null;
              const mes = fecha(ahora());
              const planLabel = PLAN_LABELS[r.plan] ?? r.plan;
              setOpenPago(r.empresaId);
              setPagoPreviewMonto(precio);
              setMontoConsultado(precio);
              // Sin el reset, la referencia y las notas de la empresa anterior
              // siguen ahí: setFieldsValue solo pisa los campos que nombra.
              formPago.resetFields();
              formPago.setFieldsValue({
                tipo: 'MANUAL',
                monto: precio,
                concepto: precio ? `Pago plan ${planLabel} — ${mes}` : '',
              });
            }}>
            Pago
          </Button>
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => { formCargo.resetFields(); setOpenCargo(r.empresaId); }}
            danger>
            Cargo
          </Button>
          <Button size="small" icon={<MinusOutlined />}
            onClick={() => { formCredito.resetFields(); setOpenCredito(r.empresaId); }}
            style={{ color: '#10b981', borderColor: '#10b981' }}>
            Crédito
          </Button>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => setOpenHist(r.empresaId)}>
            Historial
          </Button>
          <Button size="small" icon={<BellOutlined />}
            loading={recordatorioMut.isPending}
            onClick={() => recordatorioMut.mutate(r.empresaId)}>
            Recordatorio
          </Button>
        </Space>
      ),
    },
  ];

  // ── Columnas comprobantes pendientes ─────────────────────────────────────
  const colsPendientes = [
    { title: 'Empresa', dataIndex: 'empresaNombre', key: 'empresaNombre', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: 'Monto',
      dataIndex: 'monto',
      key: 'monto',
      width: 110,
      render: (v: number) => <Text strong>{fmtDop(v)}</Text>,
    },
    { title: 'Referencia', dataIndex: 'referencia', key: 'referencia', width: 130, render: (v: string) => v ?? '—' },
    { title: 'Fecha', dataIndex: 'creadoEn', key: 'creadoEn', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Notas', dataIndex: 'notas', key: 'notas', ellipsis: true, render: (v: string) => v ?? '—' },
    {
      title: 'Comprobante',
      dataIndex: 'comprobanteUrl',
      key: 'comprobanteUrl',
      width: 140,
      render: (url: string, r: PagoSuscripcion) => url ? (
        <Button
          size="small"
          type="link"
          icon={<EyeOutlined />}
          style={{ color: '#3b82f6', padding: 0 }}
          onClick={() => setOpenComprobante(r)}
        >
          Ver comprobante
        </Button>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>Sin comprobante</Text>
      ),
    },
    {
      title: 'Acciones',
      key: 'actions',
      width: 160,
      render: (_: any, r: PagoSuscripcion) => (
        <Space>
          <Popconfirm
            title="¿Confirmar este pago?"
            description={avisoPreview(r.preview, true)?.texto
              ?? 'Esto activará o extenderá la suscripción de la empresa.'}
            onConfirm={() => confirmarMut.mutate(r.id)}
            okText="Confirmar" cancelText="Cancelar"
          >
            <Button
              size="small" type="primary" icon={<CheckOutlined />}
              loading={confirmarMut.isPending}
            >
              Confirmar
            </Button>
          </Popconfirm>
          <Button
            size="small" danger icon={<CloseOutlined />}
            onClick={() => { formRechazo.resetFields(); setOpenRechazo(r.id); }}
          >
            Rechazar
          </Button>
        </Space>
      ),
    },
  ];

  // ── Columnas historial empresa ────────────────────────────────────────────
  const colsHist = [
    { title: 'Fecha', dataIndex: 'creadoEn', key: 'creadoEn', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Concepto', dataIndex: 'concepto', key: 'concepto', ellipsis: true },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'Monto', dataIndex: 'monto', key: 'monto', width: 120, align: 'right' as const,
      render: (v: number | string, r: PagoSuscripcion) => {
        const monto = Number(v ?? 0);
        const esCargo = r.tipo === 'CARGO';
        return (
          <Text style={{ color: esCargo ? '#ef4444' : '#10b981', fontWeight: 600 }}>
            {esCargo ? '+' : '−'}{fmtDop(monto)}
          </Text>
        );
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', key: 'estado', width: 100,
      render: (v: string) => (
        <Tag color={{ PENDIENTE: 'orange', CONFIRMADO: 'green', RECHAZADO: 'red' }[v] ?? 'default'}>
          {v}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            💰 Panel de Cobros
          </Title>
        </Col>
        <Col>
          <Button icon={<BankOutlined />} onClick={() => {
            setOpenBanco(true);
            formBanco.resetFields();
            if (configBanco) formBanco.setFieldsValue(configBanco);
          }}>
            Datos bancarios
          </Button>
        </Col>
      </Row>

      {/* Stats rápidos */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Comprobantes pendientes"
              value={pendientes.length}
              valueStyle={{ color: pendientes.length > 0 ? '#f59e0b' : '#10b981' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Con saldo pendiente"
              value={resumen.filter(r => Number(r.saldo) > 0).length}
              valueStyle={{ color: '#ef4444' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Empresas activas"
              value={resumen.filter(r => r.estadoSuscripcion === 'activa').length}
              valueStyle={{ color: '#10b981' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="MRR estimado"
              prefix="RD$"
              value={resumen
                .filter(r => r.estadoSuscripcion === 'activa')
                .reduce((s, r) => s + (r.precioMensual ?? 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              valueStyle={{ color: '#7c3aed' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="cobros"
        items={[
          {
            key: 'cobros',
            label: 'Cobros por empresa',
            children: (
              <Card extra={
                <ColumnToggle columns={COLS_RESUMEN}
                  visibleColumns={colVisResumen.visibleColumns}
                  onChange={colVisResumen.updateVisibility} />
              }>
                <Table
                  columns={colVisResumen.filterColumns(colsResumen as any)}
                  dataSource={resumen}
                  rowKey="empresaId"
                  loading={loadRes}
                  size="small"
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 'max-content' }}
                />
              </Card>
            ),
          },
          {
            key: 'pendientes',
            label: (
              <Badge count={pendientes.length} offset={[8, 0]}>
                Comprobantes pendientes
              </Badge>
            ),
            children: (
              <Card extra={
                <ColumnToggle columns={COLS_PENDIENTES}
                  visibleColumns={colVisPendientes.visibleColumns}
                  onChange={colVisPendientes.updateVisibility} />
              }>
                {pendientes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                    ✅ Sin comprobantes pendientes de revisión
                  </div>
                ) : (
                  <Table
                    columns={colVisPendientes.filterColumns(colsPendientes as any)}
                    dataSource={pendientes}
                    rowKey="id"
                    loading={loadPend}
                    size="small"
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 'max-content' }}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Modal: Registrar pago.
          Sin destroyOnClose a propósito: este formulario se PRERRELLENA al
          abrirlo (plan, monto y concepto) y el setFieldsValue del botón corre
          antes de que el modal monte. La limpieza va explícita, al abrir y al
          cerrar. */}
      <Modal
        title={`💵 Registrar pago — ${nombreEmpresa(openPago)}`}
        open={!!openPago}
        onCancel={() => { setOpenPago(null); setPagoPreviewMonto(null); setMontoConsultado(null); formPago.resetFields(); }}
        footer={null}
      >
        {(() => {
          const row = resumen.find(r => r.empresaId === openPago);
          if (!row) return null;
          const precio = row.precioMensual ?? null;
          const planLabel = PLAN_LABELS[row.plan] ?? row.plan;
          return (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc',
              borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{row.nombre}</div>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>PLAN</Text>
                  <div style={{ fontWeight: 600 }}>{planLabel}{precio != null ? ` — RD$${precio.toLocaleString('es-DO')}/mes` : ''}</div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>SALDO PENDIENTE</Text>
                  <div style={{ fontWeight: 600, color: Number(row.saldo) > 0 ? '#dc2626' : '#16a34a' }}>
                    {fmtDop(Number(row.saldo))}
                  </div>
                </Col>
                <Col span={12} style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>VENCIMIENTO</Text>
                  <div style={{ fontSize: 13 }}>{fmtDate(row.venceSuscripcion)}</div>
                </Col>
                <Col span={12} style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>ESTADO</Text>
                  <div style={{ fontSize: 13 }}>{row.estadoSuscripcion}</div>
                </Col>
              </Row>
            </div>
          );
        })()}
        <Form form={formPago} layout="vertical"
          onFinish={v => pagoMut.mutate({ id: openPago, ...v })}>
          <Form.Item name="tipo" label="Tipo de pago" rules={[{ required: true }]}>
            <Select options={[
              { value: 'MANUAL',        label: '📋 Manual (efectivo / otro)' },
              { value: 'TRANSFERENCIA', label: '🏦 Transferencia bancaria' },
              { value: 'TARJETA',       label: '💳 Tarjeta' },
            ]} />
          </Form.Item>
          <Form.Item name="concepto" label="Concepto" rules={[{ required: true }]}>
            <Input placeholder="Ej. Pago plan Emprendedor — Junio 2026" />
          </Form.Item>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber
              prefix="RD$" min={0.01} precision={2} style={{ width: '100%' }}
              onChange={(v) => setPagoPreviewMonto(typeof v === 'number' ? v : null)}
            />
          </Form.Item>
          {(() => {
            if (pagoPreviewMonto == null || pagoPreviewMonto <= 0) return null;
            const aviso = previewAlDia ? avisoPreview(previewPago) : null;
            const c = aviso ? TONO_AVISO[aviso.tono] : { fondo: '#f8fafc', borde: '#e2e8f0', texto: '#64748b' };
            return (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 6 }}>
                <Text style={{ color: c.texto, fontSize: 13 }}>{aviso?.texto ?? 'Calculando…'}</Text>
              </div>
            );
          })()}
          <Form.Item name="referencia" label="Referencia">
            <Input />
          </Form.Item>
          <Form.Item name="notas" label="Notas">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => { setOpenPago(null); setPagoPreviewMonto(null); setMontoConsultado(null); formPago.resetFields(); }}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={pagoMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Cargo adicional */}
      <Modal
        title={`📌 Agregar cargo — ${nombreEmpresa(openCargo)}`}
        open={!!openCargo} destroyOnClose
        onCancel={cerrar(setOpenCargo, formCargo)} footer={null}
      >
        <Form form={formCargo} layout="vertical"
          onFinish={v => cargoMut.mutate({ id: openCargo, ...v })}>
          <Form.Item name="concepto" label="Concepto del cargo" rules={[{ required: true }]}>
            <Input placeholder="Ej. Soporte técnico adicional" />
          </Form.Item>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber prefix="RD$" min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notas" label="Notas internas">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={cerrar(setOpenCargo, formCargo)}>Cancelar</Button></Col>
            <Col><Button type="primary" danger htmlType="submit" loading={cargoMut.isPending}>Agregar cargo</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Crédito / descuento */}
      <Modal
        title={`✅ Aplicar crédito — ${nombreEmpresa(openCredito)}`}
        open={!!openCredito} destroyOnClose
        onCancel={cerrar(setOpenCredito, formCredito)} footer={null}
      >
        <Form form={formCredito} layout="vertical"
          onFinish={v => creditoMut.mutate({ id: openCredito, ...v })}>
          <Form.Item name="concepto" label="Concepto del crédito" rules={[{ required: true }]}>
            <Input placeholder="Ej. Descuento especial por referido" />
          </Form.Item>
          <Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
            <InputNumber prefix="RD$" min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notas" label="Notas internas">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={cerrar(setOpenCredito, formCredito)}>Cancelar</Button></Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                loading={creditoMut.isPending}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                Aplicar crédito
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Historial empresa */}
      <Modal
        title={`📋 Historial — ${nombreEmpresa(openHist)}`}
        open={!!openHist} onCancel={() => setOpenHist(null)} footer={null}
        width={700}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <ColumnToggle columns={COLS_HIST}
            visibleColumns={colVisHist.visibleColumns}
            onChange={colVisHist.updateVisibility} />
        </div>
        <Table
          columns={colVisHist.filterColumns(colsHist as any)}
          dataSource={histEmpresa}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Modal>

      {/* Modal: Ver comprobante */}
      <Modal
        title={
          openComprobante
            ? `🧾 Comprobante — ${openComprobante.empresaNombre ?? `Empresa #${openComprobante.empresaId}`} — ${fmtDop(openComprobante.monto)}`
            : '🧾 Comprobante'
        }
        open={!!openComprobante}
        onCancel={() => setOpenComprobante(null)}
        width={680}
        footer={[
          <Button
            key="rechazar"
            danger
            icon={<CloseOutlined />}
            onClick={() => {
              const id = openComprobante!.id;
              setOpenComprobante(null);
              formRechazo.resetFields();
              setOpenRechazo(id);
            }}
          >
            Rechazar ❌
          </Button>,
          <Popconfirm
            key="confirmar"
            title="¿Confirmar este pago?"
            description={avisoPreview(openComprobante?.preview, true)?.texto
              ?? 'Esto activará o extenderá la suscripción de la empresa.'}
            onConfirm={() => {
              confirmarMut.mutate(openComprobante!.id);
              setOpenComprobante(null);
            }}
            okText="Confirmar" cancelText="Cancelar"
          >
            <Button type="primary" icon={<CheckOutlined />} loading={confirmarMut.isPending}>
              Confirmar pago ✅
            </Button>
          </Popconfirm>,
        ]}
      >
        {openComprobante?.comprobanteUrl && (() => {
          const url = openComprobante.comprobanteUrl!;
          const isPdf = url.toLowerCase().endsWith('.pdf');
          return isPdf ? (
            <div style={{ textAlign: 'center' }}>
              <iframe
                src={url}
                style={{ width: '100%', height: 480, border: 'none', borderRadius: 8 }}
                title="Comprobante PDF"
              />
              <Button
                type="link"
                href={url}
                target="_blank"
                style={{ marginTop: 8 }}
              >
                Abrir en nueva pestaña ↗
              </Button>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Image
                src={url}
                alt="Comprobante"
                style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 8, objectFit: 'contain' }}
                preview={{ src: url }}
              />
            </div>
          );
        })()}
        {openComprobante && (
          <Descriptions size="small" style={{ marginTop: 16 }} column={2} bordered>
            <Descriptions.Item label="Referencia">
              {openComprobante.referencia ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Fecha subida">
              {fmtDate(openComprobante.creadoEn)}
            </Descriptions.Item>
            {openComprobante.notas && (
              <Descriptions.Item label="Notas" span={2}>
                {openComprobante.notas}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* Modal: Rechazar transferencia */}
      <Modal
        title="❌ Rechazar comprobante"
        open={!!openRechazo} destroyOnClose
        onCancel={cerrar(setOpenRechazo, formRechazo)} footer={null}
      >
        <Form form={formRechazo} layout="vertical"
          onFinish={v => rechazarMut.mutate({ pagoId: openRechazo, motivo: v.motivoRechazo })}>
          <Form.Item
            name="motivoRechazo"
            label="Motivo del rechazo"
            rules={[{ required: true, message: 'Ingresa el motivo' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ej. El comprobante no coincide con el monto, imagen ilegible..."
            />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={cerrar(setOpenRechazo, formRechazo)}>Cancelar</Button></Col>
            <Col><Button danger type="primary" htmlType="submit" loading={rechazarMut.isPending}>Rechazar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Datos bancarios */}
      <Modal
        title={<><BankOutlined /> Datos bancarios de HiCloud</>}
        open={openBanco} onCancel={() => setOpenBanco(false)} footer={null}
      >
        <Form form={formBanco} layout="vertical"
          onFinish={v => bancMut.mutate(v)}>
          <Form.Item name="banco" label="Banco" rules={[{ required: true }]}>
            <Input placeholder="Ej. Banco Popular Dominicano" />
          </Form.Item>
          <Form.Item name="numeroCuenta" label="Número de cuenta" rules={[{ required: true }]}>
            <Input placeholder="Ej. 000-000000-0" />
          </Form.Item>
          <Form.Item name="tipoCuenta" label="Tipo de cuenta">
            <Select options={[
              { value: 'corriente', label: 'Corriente' },
              { value: 'ahorro',   label: 'Ahorro' },
            ]} />
          </Form.Item>
          <Form.Item name="titular" label="Titular" rules={[{ required: true }]}>
            <Input placeholder="Ej. HiCloud ERP SRL" />
          </Form.Item>
          <Form.Item name="rnc" label="RNC / Cédula titular">
            <Input placeholder="Ej. 1-31-12345-6" />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenBanco(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={bancMut.isPending}>Guardar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

