import { useState } from 'react';
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
import { pagosAdminApi, PagoSuscripcion, ResumenCobros } from '../../api/pagos.api';
import { fmtDop } from '../../utils/fmt';

const { Title, Text } = Typography;

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PLAN_LABELS:  Record<string, string> = { emprendedor: 'Emprendedor', pyme: 'PYME', pro: 'Pro', plus: 'Plus' };

interface PreviewPago {
  periodos:     number;
  nuevaFecha:   string | null;
  faltante:     number;
  enPasado:     boolean;
}

function calcularPreviewPago(monto: number, precioMensual: number, venceSuscripcion: string, diaCorte: number, modalidad: string): PreviewPago {
  const precioPorPeriodo = modalidad === 'anual' ? precioMensual * 12 : precioMensual;
  const periodos = precioPorPeriodo > 0 ? Math.floor(monto / precioPorPeriodo) : 0;
  if (periodos === 0) return { periodos, nuevaFecha: null, faltante: precioPorPeriodo - monto, enPasado: false };
  const [y, m] = venceSuscripcion.slice(0, 7).split('-').map(Number);
  let ny = y, nm = m;
  if (modalidad === 'anual') { ny += periodos; }
  else { nm += periodos; while (nm > 12) { nm -= 12; ny += 1; } }
  const ultimoDia = new Date(ny, nm, 0).getDate();
  const nd = Math.min(diaCorte, ultimoDia);
  const nuevaFecha = `${ny}-${String(nm).padStart(2,'0')}-${String(nd).padStart(2,'0')}`;
  return { periodos, nuevaFecha, faltante: 0, enPasado: new Date(nuevaFecha + 'T12:00:00').getTime() < Date.now() };
}

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

  // ── Mutations ────────────────────────────────────────────────────────────
  const pagoMut = useMutation({
    mutationFn: ({ id, ...d }: any) => pagosAdminApi.registrarPago(id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cobros-resumen'] });
      setOpenPago(null); setPagoPreviewMonto(null); formPago.resetFields();
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
  const colsResumen = [
    {
      title: 'Empresa',
      dataIndex: 'nombre',
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
      width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{(v ?? '').toUpperCase()}</Tag>,
    },
    {
      title: 'Vencimiento',
      dataIndex: 'venceSuscripcion',
      width: 130,
      render: (v: string, r: ResumenCobros) => {
        const dias = v ? Math.ceil((new Date(v).getTime() - Date.now()) / 86400000) : null;
        return (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <Text>{fmtDate(v)}</Text>
            </Space>
            {dias !== null && (
              <Text style={{ fontSize: 11, color: dias <= 3 ? '#ef4444' : dias <= 7 ? '#f59e0b' : '#6b7280' }}>
                {dias > 0 ? `${dias}d` : 'Vencida'}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
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
      width: 110,
      render: (v: string) => fmtDate(v),
    },
    {
      title: 'Pendientes',
      dataIndex: 'pendientesConfirmacion',
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
              const mes = new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
              const planLabel = PLAN_LABELS[r.plan] ?? r.plan;
              setOpenPago(r.empresaId);
              setPagoPreviewMonto(precio);
              formPago.setFieldsValue({
                tipo: 'MANUAL',
                monto: precio,
                concepto: precio ? `Pago plan ${planLabel} — ${mes}` : '',
              });
            }}>
            Pago
          </Button>
          <Button size="small" icon={<PlusOutlined />}
            onClick={() => { setOpenCargo(r.empresaId); }}
            danger>
            Cargo
          </Button>
          <Button size="small" icon={<MinusOutlined />}
            onClick={() => { setOpenCredito(r.empresaId); }}
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
    { title: 'Empresa', dataIndex: 'empresaNombre', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: 'Monto',
      dataIndex: 'monto',
      width: 110,
      render: (v: number) => <Text strong>{fmtDop(v)}</Text>,
    },
    { title: 'Referencia', dataIndex: 'referencia', width: 130, render: (v: string) => v ?? '—' },
    { title: 'Fecha', dataIndex: 'creadoEn', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Notas', dataIndex: 'notas', ellipsis: true, render: (v: string) => v ?? '—' },
    {
      title: 'Comprobante',
      dataIndex: 'comprobanteUrl',
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
            description={(() => {
              if (!r.precioMensual || !r.venceSuscripcion || r.diaCorte == null) return 'Esto activará o extenderá la suscripción de la empresa.';
              const preview = calcularPreviewPago(Number(r.monto), r.precioMensual, r.venceSuscripcion, r.diaCorte, r.modalidad ?? 'mensual');
              if (preview.periodos === 0) return `⚠️ No extiende la suscripción. Faltan ${fmtDop(preview.faltante)} para un período.`;
              const fechaFmt = preview.nuevaFecha
                ? new Date(preview.nuevaFecha + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '';
              if (preview.enPasado) return `🔴 Queda vencida hasta ${fechaFmt}. Cubre ${preview.periodos} período(s).`;
              return `✅ Cubre ${preview.periodos} período(s). Nuevo vencimiento: ${fechaFmt}`;
            })()}
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
            onClick={() => setOpenRechazo(r.id)}
          >
            Rechazar
          </Button>
        </Space>
      ),
    },
  ];

  // ── Columnas historial empresa ────────────────────────────────────────────
  const colsHist = [
    { title: 'Fecha', dataIndex: 'creadoEn', width: 110, render: (v: string) => fmtDate(v) },
    { title: 'Concepto', dataIndex: 'concepto', ellipsis: true },
    {
      title: 'Tipo', dataIndex: 'tipo', width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: 'Monto', dataIndex: 'monto', width: 120, align: 'right' as const,
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
      title: 'Estado', dataIndex: 'estado', width: 100,
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
              <Card>
                <Table
                  columns={colsResumen}
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
              <Card>
                {pendientes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                    ✅ Sin comprobantes pendientes de revisión
                  </div>
                ) : (
                  <Table
                    columns={colsPendientes}
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

      {/* Modal: Registrar pago */}
      <Modal
        title={`💵 Registrar pago — Empresa #${openPago}`}
        open={!!openPago} onCancel={() => { setOpenPago(null); setPagoPreviewMonto(null); }} footer={null}
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
            const row = resumen.find(r => r.empresaId === openPago);
            if (!row || pagoPreviewMonto == null || !row.venceSuscripcion || row.diaCorte == null) return null;
            const preview = calcularPreviewPago(
              pagoPreviewMonto,
              row.precioMensual ?? 0,
              row.venceSuscripcion,
              row.diaCorte,
              row.modalidad ?? 'mensual',
            );
            const fechaFmt = preview.nuevaFecha
              ? new Date(preview.nuevaFecha + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : '';
            if (preview.periodos === 0) return (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 6 }}>
                <Text style={{ color: '#854d0e', fontSize: 13 }}>
                  ⚠️ Este pago NO extiende la suscripción. Faltan {fmtDop(preview.faltante)} para completar un período.
                </Text>
              </div>
            );
            if (preview.enPasado) return (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6 }}>
                <Text style={{ color: '#991b1b', fontSize: 13 }}>
                  🔴 Queda vencida hasta {fechaFmt}. Este pago cubre {preview.periodos} período(s).
                </Text>
              </div>
            );
            return (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6 }}>
                <Text style={{ color: '#166534', fontSize: 13 }}>
                  ✅ Este pago cubre {preview.periodos} período(s). Nuevo vencimiento: {fechaFmt}
                </Text>
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
            <Col><Button onClick={() => setOpenPago(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={pagoMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Cargo adicional */}
      <Modal
        title={`📌 Agregar cargo — Empresa #${openCargo}`}
        open={!!openCargo} onCancel={() => setOpenCargo(null)} footer={null}
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
            <Col><Button onClick={() => setOpenCargo(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" danger htmlType="submit" loading={cargoMut.isPending}>Agregar cargo</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal: Crédito / descuento */}
      <Modal
        title={`✅ Aplicar crédito — Empresa #${openCredito}`}
        open={!!openCredito} onCancel={() => setOpenCredito(null)} footer={null}
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
            <Col><Button onClick={() => setOpenCredito(null)}>Cancelar</Button></Col>
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
        title={`📋 Historial — Empresa #${openHist}`}
        open={!!openHist} onCancel={() => setOpenHist(null)} footer={null}
        width={700}
      >
        <Table
          columns={colsHist}
          dataSource={histEmpresa}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 15 }}
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
              setOpenRechazo(id);
            }}
          >
            Rechazar ❌
          </Button>,
          <Popconfirm
            key="confirmar"
            title="¿Confirmar este pago?"
            description={(() => {
              if (!openComprobante?.precioMensual || !openComprobante?.venceSuscripcion || openComprobante?.diaCorte == null) return 'Esto activará o extenderá la suscripción de la empresa.';
              const preview = calcularPreviewPago(Number(openComprobante.monto), openComprobante.precioMensual, openComprobante.venceSuscripcion, openComprobante.diaCorte, openComprobante.modalidad ?? 'mensual');
              if (preview.periodos === 0) return `⚠️ No extiende la suscripción. Faltan ${fmtDop(preview.faltante)} para un período.`;
              const fechaFmt = preview.nuevaFecha
                ? new Date(preview.nuevaFecha + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '';
              if (preview.enPasado) return `🔴 Queda vencida hasta ${fechaFmt}. Cubre ${preview.periodos} período(s).`;
              return `✅ Cubre ${preview.periodos} período(s). Nuevo vencimiento: ${fechaFmt}`;
            })()}
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
        open={!!openRechazo} onCancel={() => setOpenRechazo(null)} footer={null}
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
            <Col><Button onClick={() => setOpenRechazo(null)}>Cancelar</Button></Col>
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

