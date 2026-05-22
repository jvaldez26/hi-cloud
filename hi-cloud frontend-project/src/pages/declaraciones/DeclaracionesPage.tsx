import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Typography, Select, Table, Tag, Statistic,
  Tabs, Button, Space, Alert, Progress, Tooltip, Spin,
  Badge, message, theme, Input,
} from 'antd';
import {
  FileDoneOutlined, DownloadOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, BarChartOutlined, FileTextOutlined,
  SafetyCertificateOutlined, FileExcelOutlined, FilePdfOutlined,
  HistoryOutlined, WarningOutlined, SyncOutlined, ClockCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportar606, exportar607 } from '../../utils/exportExcel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;
type TipoFormato = '606' | '607' | '608';

const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: dayjs().month(i).format('MMMM'),
}));

// ── API ───────────────────────────────────────────────────────────────────────

const declApi = {
  it1:        (m: number, a: number) => api.get(`/declaraciones/it1?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  formato606: (m: number, a: number) => api.get(`/declaraciones/formato606?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  formato607: (m: number, a: number) => api.get(`/declaraciones/formato607?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  formato608: (m: number, a: number) => api.get(`/declaraciones/formato608?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  ir17:       (m: number, a: number) => api.get(`/declaraciones/ir17?mes=${m}&anio=${a}`).then(r => r.data?.data ?? r.data),
  anual:      (a: number)            => api.get(`/declaraciones/resumen-anual?anio=${a}`).then(r => r.data?.data ?? r.data),
  validar:    (tipo: TipoFormato, m: number, a: number) =>
    api.post('/declaraciones/validar', { tipo, mes: m, anio: a }).then(r => r.data?.data ?? r.data),
  historial:  () => api.get('/declaraciones/historial').then(r => r.data?.data ?? r.data),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    'X-Empresa-ID': localStorage.getItem('empresaId') ?? '',
  };
}

function exportCSV(nombre: string, filas: any[], columnas: { key: string; label: string }[]) {
  const header = columnas.map(c => c.label).join(',');
  const rows   = filas.map(f => columnas.map(c => `"${f[c.key] ?? ''}"`).join(','));
  const csv    = [header, ...rows].join('\n');
  const blob   = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a      = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${nombre}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  message.success(`${nombre}.csv descargado`);
}

function descargarPDF(endpoint: string, filename: string) {
  fetch(`/api/v1/${endpoint}`, { headers: authHeaders() })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      URL.revokeObjectURL(a.href); message.success(`${filename} descargado`);
    }).catch(() => message.error('Error al generar PDF'));
}

async function descargarTxt(
  tipo: TipoFormato, mes: number, anio: number,
  setCargando: (v: boolean) => void,
) {
  setCargando(true);
  const periodo = `${anio}${String(mes).padStart(2, '0')}`;
  try {
    const res = await fetch(
      `/api/v1/declaraciones/formato${tipo}/txt?mes=${mes}&anio=${anio}`,
      { headers: authHeaders() },
    );
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const blob = await res.blob();
    const rnc  = res.headers.get('content-disposition')?.match(/(\d{9})_/)?.[1] ?? '';
    const filename = `${tipo}_${rnc}_${periodo}.txt`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
    message.success(`${filename} descargado exitosamente`);
  } catch (e: any) {
    message.error('Error al generar el TXT: ' + (e.message ?? ''));
  } finally {
    setCargando(false);
  }
}

// ── Componente: Panel de Validación ──────────────────────────────────────────

interface Problema {
  nivel: 'error' | 'advertencia';
  campo: string;
  mensaje: string;
  referencia: string;
  ruta?: string;
}

function ValidationPanel({
  tipo, mes, anio, onTxtClick, txtCargando,
}: {
  tipo: TipoFormato; mes: number; anio: number;
  onTxtClick: () => void; txtCargando: boolean;
}) {
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState<{
    valido: boolean; errores: Problema[]; advertencias: Problema[];
    totalLineas: number; lineasOk: number;
  } | null>(null);

  const validar = useCallback(async () => {
    setValidando(true);
    setResultado(null);
    try {
      const r = await declApi.validar(tipo, mes, anio);
      setResultado(r);
    } catch { message.error('Error al validar'); }
    finally { setValidando(false); }
  }, [tipo, mes, anio]);

  // Auto-validar al cambiar período
  useEffect(() => { setResultado(null); }, [mes, anio, tipo]);

  const errCnt  = resultado?.errores.length ?? 0;
  const advCnt  = resultado?.advertencias.length ?? 0;
  const okCnt   = resultado?.lineasOk ?? 0;
  const total   = resultado?.totalLineas ?? 0;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Barra de acciones validación + TXT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: resultado ? 10 : 0 }}>
        <Button size="small" icon={validando ? <SyncOutlined spin /> : <CheckCircleOutlined />}
          onClick={validar} disabled={validando}>
          {validando ? 'Validando…' : 'Validar antes de exportar'}
        </Button>
        {resultado && !validando && (
          <span style={{ fontSize: 12 }}>
            {errCnt > 0
              ? <Tag color="red" icon={<ExclamationCircleOutlined />}>{errCnt} errores</Tag>
              : <Tag color="green" icon={<CheckCircleOutlined />}>Sin errores</Tag>}
            {advCnt > 0 && <Tag color="orange" icon={<WarningOutlined />}>{advCnt} advertencias</Tag>}
            <Text type="secondary" style={{ fontSize: 11 }}>{okCnt}/{total} registros OK</Text>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Tooltip title={errCnt > 0 ? `Corrige ${errCnt} error(es) antes de exportar` : 'Descargar formato oficial DGII'}>
          <Button
            type="primary"
            style={{ background: errCnt > 0 ? undefined : '#1d4ed8' }}
            disabled={errCnt > 0 || txtCargando}
            loading={txtCargando}
            onClick={onTxtClick}
            icon={<DownloadOutlined />}
          >
            TXT Oficial DGII
          </Button>
        </Tooltip>
      </div>

      {/* Panel de resultados */}
      {resultado && !validando && (
        <div style={{ fontSize: 12 }}>
          {/* Errores */}
          {errCnt > 0 && (
            <Alert type="error" style={{ marginBottom: 6 }}
              message={<span style={{ fontWeight: 700 }}>❌ {errCnt} error{errCnt !== 1 ? 'es' : ''} que bloquean la exportación</span>}
              description={
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {resultado.errores.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #fca5a5' }}>
                      <span>
                        <Tag color="red" style={{ fontSize: 10 }}>{e.campo}</Tag>
                        <Text code style={{ fontSize: 11 }}>{e.referencia}</Text>
                        {' — '}{e.mensaje}
                      </span>
                      {e.ruta && (
                        <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }}
                          onClick={() => window.open(e.ruta, '_blank')}>
                          Corregir →
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              }
            />
          )}

          {/* Advertencias */}
          {advCnt > 0 && (
            <Alert type="warning" style={{ marginBottom: 6 }}
              message={<span style={{ fontWeight: 700 }}>⚠️ {advCnt} advertencia{advCnt !== 1 ? 's' : ''}</span>}
              description={
                <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                  {resultado.advertencias.map((w, i) => (
                    <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #fde68a' }}>
                      <Tag color="orange" style={{ fontSize: 10 }}>{w.campo}</Tag>
                      <Text code style={{ fontSize: 11 }}>{w.referencia}</Text>
                      {' — '}{w.mensaje}
                    </div>
                  ))}
                </div>
              }
            />
          )}

          {/* Todo OK */}
          {errCnt === 0 && resultado && (
            <Alert type="success" showIcon
              message={`✅ ${okCnt} registros válidos listos para exportar${advCnt > 0 ? ` (${advCnt} advertencias no bloquean)` : ''}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente: Historial de reportes ────────────────────────────────────────

function HistorialPanel({ mes, anio }: { mes: number; anio: number }) {
  const { data: historial, isLoading, refetch } = useQuery<any[]>({
    queryKey: ['decl-historial'],
    queryFn: declApi.historial,
    staleTime: 0,
  });

  const cols = [
    { title: 'Tipo', dataIndex: 'tipo', width: 70,
      render: (v: string) => <Tag color={v === '607' ? 'blue' : v === '606' ? 'purple' : 'orange'}>{v}</Tag> },
    { title: 'Período', width: 100,
      render: (_: any, r: any) => `${MESES.find(m => m.value === r.mes)?.label.slice(0,3)} ${r.anio}` },
    { title: 'Registros', dataIndex: 'totalLineas', width: 90, align: 'right' as const },
    { title: 'Monto Total', dataIndex: 'totalMonto', width: 130, align: 'right' as const,
      render: (v: number) => fmt.money(v) },
    { title: 'Errores', dataIndex: 'errores', width: 80, align: 'center' as const,
      render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag color="green">0</Tag> },
    { title: 'Integridad', dataIndex: 'hashContenido', width: 90, align: 'center' as const,
      render: (v: string) => v
        ? <Tooltip title="Hash SHA-256 guardado — archivo íntegro"><Tag color="green" icon={<CheckCircleOutlined />}>✅</Tag></Tooltip>
        : <Tag color="orange">N/A</Tag> },
    { title: 'Generado', dataIndex: 'createdAt', width: 140,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YY HH:mm') : '—' },
    { title: '', width: 100, align: 'right' as const,
      render: (_: any, r: any) => (
        <Button size="small" icon={<DownloadOutlined />}
          onClick={() => {
            const a = document.createElement('a');
            a.href = `/api/v1/declaraciones/historial/${r.id}/txt`;
            const periodo = `${r.anio}${String(r.mes).padStart(2,'0')}`;
            a.download = `${r.tipo}_${periodo}.txt`;
            // Use fetch with auth headers
            fetch(`/api/v1/declaraciones/historial/${r.id}/txt`, { headers: authHeaders() })
              .then(res => res.blob())
              .then(blob => {
                a.href = URL.createObjectURL(blob);
                a.click();
                URL.revokeObjectURL(a.href);
              });
          }}>
          Descargar
        </Button>
      ) },
  ];

  // Alert si el período actual ya fue exportado
  const yaExportado = historial?.filter(h =>
    h.mes === mes && h.anio === anio
  ) ?? [];

  return (
    <div>
      {yaExportado.length > 0 && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`Este período (${MESES.find(m => m.value === mes)?.label} ${anio}) ya fue exportado ${yaExportado.length} vez${yaExportado.length !== 1 ? 'ces' : ''}`}
          description={`Último: ${dayjs(yaExportado[0].createdAt).format('DD/MM/YYYY HH:mm')} — tipos: ${[...new Set(yaExportado.map((h: any) => h.tipo))].join(', ')}`}
        />
      )}
      <Table
        columns={cols}
        dataSource={historial ?? []}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 12, showSizeChanger: false }}
        locale={{ emptyText: 'Sin reportes generados aún' }}
      
        scroll={{ x: 'max-content' }} />
    </div>
  );
}

// ── Tarjeta de estado IT-1 ────────────────────────────────────────────────────
function IT1Card({ data }: { data: any }) {
  const { token } = theme.useToken();
  if (!data) return null;
  const { liquidacion, ventas, compras } = data;
  const isPagar = liquidacion.estado === 'A PAGAR';

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card style={{ borderColor: isPagar ? '#ef4444' : '#10b981', borderWidth: 2, textAlign: 'center' }}>
          <Statistic title="Estado IT-1"
            value={liquidacion.estado}
            valueStyle={{ color: isPagar ? '#ef4444' : '#10b981', fontSize: 22, fontWeight: 700 }} />
          <Statistic title="ITBIS Neto"
            value={Math.abs(liquidacion.itbisNeto)}
            formatter={v => fmt.money(Number(v))}
            valueStyle={{ color: isPagar ? '#ef4444' : '#10b981', fontSize: 18 }} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Ventas gravadas" value={ventas?.total ?? 0} formatter={v => fmt.money(Number(v))} />
          <Statistic title="ITBIS cobrado (18%)" value={liquidacion.itbisDebito ?? 0} formatter={v => fmt.money(Number(v))}
            valueStyle={{ color: '#ef4444' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>{ventas?.cantidadFacturas ?? 0} facturas</Text>
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Compras gravadas" value={compras?.total ?? 0} formatter={v => fmt.money(Number(v))} />
          <Statistic title="Crédito fiscal (ITBIS pagado)" value={liquidacion.itbisCredito ?? 0} formatter={v => fmt.money(Number(v))}
            valueStyle={{ color: '#10b981' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>{compras?.cantidadCompras ?? compras?.cantidad ?? 0} compras</Text>
        </Card>
      </Col>
    </Row>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DeclaracionesPage() {
  const { token } = theme.useToken();
  const mesAnterior = dayjs().subtract(1, 'month');
  const [mes,    setMes]    = useState(dayjs().month() + 1);
  const [anio,   setAnio]   = useState(dayjs().year());
  const [search, setSearch] = useState('');
  const [txt606, setTxt606] = useState(false);
  const [txt607, setTxt607] = useState(false);
  const [txt608, setTxt608] = useState(false);

  const { data: it1,    isLoading: l1 } = useQuery({ queryKey: ['decl-it1', mes, anio],   queryFn: () => declApi.it1(mes, anio) });
  const { data: f606,   isLoading: l6 } = useQuery({ queryKey: ['decl-606', mes, anio],   queryFn: () => declApi.formato606(mes, anio) });
  const { data: f607,   isLoading: l7 } = useQuery({ queryKey: ['decl-607', mes, anio],   queryFn: () => declApi.formato607(mes, anio) });
  const { data: f608,   isLoading: l8 } = useQuery({ queryKey: ['decl-608', mes, anio],   queryFn: () => declApi.formato608(mes, anio) });
  const { data: anual               }   = useQuery({ queryKey: ['decl-anual', anio],       queryFn: () => declApi.anual(anio) });

  const periodLabel = `${MESES.find(m => m.value === mes)?.label} ${anio}`;

  const filas606Filtradas = useMemo(() => {
    const filas = f606?.filas ?? [];
    if (!search.trim()) return filas;
    const q = search.toLowerCase();
    return filas.filter((r: any) =>
      (r.rncProveedor ?? '').toLowerCase().includes(q) ||
      (r.nombreProveedor ?? '').toLowerCase().includes(q) ||
      (r.ncfProveedor ?? '').toLowerCase().includes(q) ||
      (r.fechaComprobante ?? '').toLowerCase().includes(q)
    );
  }, [f606, search]);

  const filas607Filtradas = useMemo(() => {
    const filas = f607?.filas ?? [];
    if (!search.trim()) return filas;
    const q = search.toLowerCase();
    return filas.filter((r: any) =>
      (r.rncComprador ?? '').toLowerCase().includes(q) ||
      (r.encf ?? '').toLowerCase().includes(q) ||
      (r.fechaComprobante ?? '').toLowerCase().includes(q)
    );
  }, [f607, search]);

  // ── ColumnToggle ─────────────────────────────────────────────────────────────
  const COLS_DEF_606 = [
    { key: 'linea',           label: '#',            defaultVisible: true  },
    { key: 'rncProveedor',    label: 'RNC Proveedor',defaultVisible: true  },
    { key: 'nombreProveedor', label: 'Proveedor',    defaultVisible: true  },
    { key: 'ncfProveedor',    label: 'NCF',          defaultVisible: true  },
    { key: 'tipoBienesLabel', label: 'Tipo Bienes',  defaultVisible: false },
    { key: 'fechaComprobante',label: 'Fecha',        defaultVisible: true  },
    { key: 'formaPagoLabel',  label: 'Forma Pago',   defaultVisible: false },
    { key: 'montoFacturado',  label: 'Monto',        defaultVisible: true  },
    { key: 'itbis',           label: 'ITBIS',        defaultVisible: true  },
  ];
  const COLS_DEF_607 = [
    { key: 'linea',           label: '#',            defaultVisible: true  },
    { key: 'rncComprador',    label: 'RNC Comprador',defaultVisible: true  },
    { key: 'encf',            label: 'e-NCF',        defaultVisible: true  },
    { key: 'tipoNcf',         label: 'Tipo',         defaultVisible: true  },
    { key: 'estadoDgii',      label: 'Estado DGII',  defaultVisible: false },
    { key: 'fechaComprobante',label: 'Fecha',        defaultVisible: true  },
    { key: 'montoFacturado',  label: 'Monto',        defaultVisible: true  },
    { key: 'itbis',           label: 'ITBIS',        defaultVisible: true  },
  ];
  const { visibleColumns: vis606, updateVisibility: upd606, filterColumns: flt606 } = useColumnVisibility('declaraciones_606', COLS_DEF_606);
  const { visibleColumns: vis607, updateVisibility: upd607, filterColumns: flt607 } = useColumnVisibility('declaraciones_607', COLS_DEF_607);

  // ── Columnas tablas ──────────────────────────────────────────────────────────
  const cols606 = [
    { title: '#',            dataIndex: 'linea',           width: 45 },
    { title: 'RNC Proveedor',dataIndex: 'rncProveedor',    width: 120, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Proveedor',    dataIndex: 'nombreProveedor', ellipsis: true },
    { title: 'NCF',          dataIndex: 'ncfProveedor',    width: 150, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Tipo Bienes',  dataIndex: 'tipoBienesLabel', width: 100, render: (v: string) => <Tag style={{ fontSize: 10 }}>{v || '09'}</Tag> },
    { title: 'Fecha',        dataIndex: 'fechaComprobante',width: 95,  render: (v: string) => v?.substring(0,10) || '—' },
    { title: 'Forma Pago',   dataIndex: 'formaPagoLabel',  width: 110, render: (v: string) => <Tag color="blue" style={{ fontSize: 10 }}>{v || '—'}</Tag> },
    { title: 'Monto',        dataIndex: 'montoFacturado',  width: 120, align: 'right' as const, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',        dataIndex: 'itbis',           width: 100, align: 'right' as const, render: (v: number) => fmt.money(v) },
  ];

  const cols607 = [
    { title: '#',            dataIndex: 'linea',           width: 45 },
    { title: 'RNC Comprador',dataIndex: 'rncComprador',    width: 120, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || 'Consumidor'}</Text> },
    { title: 'e-NCF',        dataIndex: 'encf',            width: 155, render: (v: string) => <Text code style={{ fontSize: 11, color: '#1d4ed8' }}>{v || '—'}</Text> },
    { title: 'Tipo',         dataIndex: 'tipoNcf',         width: 65,  render: (v: string) => <Tag color="blue" style={{ fontSize: 10 }}>{v}</Tag> },
    { title: 'Estado DGII',  dataIndex: 'estadoDgii',      width: 100,
      render: (v: string) => {
        const c = v === 'ACEPTADO' ? 'green' : v === 'RECHAZADO' ? 'red' : 'orange';
        return <Tag color={c} style={{ fontSize: 10 }}>{v || 'N/A'}</Tag>;
      }},
    { title: 'Fecha',        dataIndex: 'fechaComprobante',width: 95,  render: (v: string) => v?.substring(0,10) || '—' },
    { title: 'Monto',        dataIndex: 'montoFacturado',  width: 120, align: 'right' as const, render: (v: number) => fmt.money(v) },
    { title: 'ITBIS',        dataIndex: 'itbis',           width: 100, align: 'right' as const, render: (v: number) => fmt.money(v) },
  ];

  return (
    <div>
      {/* ── Header + selector de período ── */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Declaraciones Fiscales DGII
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            IT-1 · Formato 606 · Formato 607 · 608 · República Dominicana
          </Text>
        </Col>
        <Col>
          <Space>
            <Input
              placeholder="Buscar por RNC o período..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Button size="small" icon={<ClockCircleOutlined />}
              onClick={() => { setMes(mesAnterior.month() + 1); setAnio(mesAnterior.year()); }}>
              Mes anterior
            </Button>
            <Select value={mes} onChange={setMes} style={{ width: 130 }} options={MESES} />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026, 2027].map(y => ({ value: y, label: y }))} />
          </Space>
        </Col>
      </Row>

      <Tabs items={[
        // ── IT-1 ─────────────────────────────────────────────────────────────
        {
          key: 'it1',
          label: <><FileDoneOutlined /> IT-1 ITBIS</>,
          children: (
            <div>
              <Alert showIcon type="info" style={{ marginBottom: 12 }}
                message={`IT-1 — Declaración mensual ITBIS · ${periodLabel}`}
              />
              <IT1Card data={it1} />
              {it1 && (
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <Space>
                    <Button icon={<FilePdfOutlined />} danger
                      onClick={() => descargarPDF(`declaraciones/it1/pdf?mes=${mes}&anio=${anio}`, `IT1_${anio}${String(mes).padStart(2,'0')}.pdf`)}>
                      PDF IT-1
                    </Button>
                    <Button icon={<DownloadOutlined />}
                      onClick={() => exportCSV(`IT1-${anio}-${String(mes).padStart(2,'0')}`,
                        it1.ventas?.porTipoNcf ?? [],
                        [{ key: 'tipo', label: 'Tipo NCF' }, { key: 'cantidad', label: 'Cantidad' },
                         { key: 'subtotal', label: 'Subtotal' }, { key: 'itbis', label: 'ITBIS' }, { key: 'total', label: 'Total' }])}>
                      CSV IT-1
                    </Button>
                  </Space>
                </div>
              )}
            </div>
          ),
        },

        // ── Formato 606 ───────────────────────────────────────────────────────
        {
          key: 'f606',
          label: <><FileTextOutlined /> Formato 606</>,
          children: (
            <Card
              title={
                <Space>
                  <span>Formato 606 — Compras y Gastos</span>
                  {f606 && <Tag>{f606.totalLineas} registros</Tag>}
                  {f606 && <Tag color="blue">Total: {fmt.money(f606.totalMonto)}</Tag>}
                  {f606 && <Tag color="green">ITBIS: {fmt.money(f606.totalITBIS)}</Tag>}
                </Space>
              }
              extra={
                <Space>
                  <Button size="small" icon={<FileExcelOutlined />} disabled={!f606?.filas?.length}
                    onClick={() => exportar606(f606, mes, anio)}>Excel</Button>
            <RefreshByKeyButton queryKey={['declaraciones']} />
            <VideoTutorialButton />
                  <ColumnToggle columns={COLS_DEF_606} visibleColumns={vis606} onChange={upd606} />
                  <Button size="small" icon={<DownloadOutlined />} disabled={!f606?.filas?.length}
                    onClick={() => exportCSV(`Formato606-${anio}-${String(mes).padStart(2,'0')}`, f606?.filas ?? [],
                      [{ key:'linea',label:'Línea'},{ key:'rncProveedor',label:'RNC Proveedor'},
                       { key:'ncfProveedor',label:'NCF'},{ key:'tipoBienes',label:'Tipo Bienes'},
                       { key:'fechaComprobante',label:'Fecha'},{ key:'montoFacturado',label:'Monto'},
                       { key:'itbis',label:'ITBIS'},{ key:'formaPago',label:'Forma Pago'}])}>CSV</Button>
                  <Button size="small" icon={<FilePdfOutlined />} danger disabled={!f606?.filas?.length}
                    onClick={() => descargarPDF(`declaraciones/formato606/pdf?mes=${mes}&anio=${anio}`, `606_${anio}${String(mes).padStart(2,'0')}.pdf`)}>PDF</Button>
                  <Button size="small" icon={<DownloadOutlined />} disabled={!f606?.filas?.length}
                    onClick={() => fetch(`/api/v1/declaraciones/formato606/xml?mes=${mes}&anio=${anio}`, { headers: authHeaders() })
                      .then(r => r.blob()).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `606_${anio}${String(mes).padStart(2,'0')}.xml`; a.click(); URL.revokeObjectURL(a.href); })}>XML</Button>
                </Space>
              }
            >
              <ValidationPanel tipo="606" mes={mes} anio={anio}
                onTxtClick={() => descargarTxt('606', mes, anio, setTxt606)}
                txtCargando={txt606} />
              <Table columns={flt606(cols606)} dataSource={filas606Filtradas} rowKey="linea"
                loading={l6} size="small" scroll={{ x: 900 }}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                summary={() => f606?.filas?.length > 0 ? (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={7}><Text strong>Totales</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={7}><Text strong>{fmt.money(f606.totalMonto)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={8}><Text strong>{fmt.money(f606.totalITBIS)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null} />
            </Card>
          ),
        },

        // ── Formato 607 ───────────────────────────────────────────────────────
        {
          key: 'f607',
          label: <><FileTextOutlined /> Formato 607</>,
          children: (
            <Card
              title={
                <Space>
                  <span>Formato 607 — Ventas e Ingresos</span>
                  {f607 && <Tag>{f607.totalLineas} registros</Tag>}
                  {f607 && <Tag color="green">Total: {fmt.money(f607.totales?.montoFacturado ?? 0)}</Tag>}
                  {f607 && <Tag color="blue">ITBIS: {fmt.money(f607.totales?.itbis ?? 0)}</Tag>}
                </Space>
              }
              extra={
                <Space>
                  <ColumnToggle columns={COLS_DEF_607} visibleColumns={vis607} onChange={upd607} />
                  <Button size="small" icon={<FileExcelOutlined />} disabled={!f607?.filas?.length}
                    onClick={() => exportar607(f607, mes, anio)}>Excel</Button>
                  <Button size="small" icon={<DownloadOutlined />} disabled={!f607?.filas?.length}
                    onClick={() => exportCSV(`Formato607-${anio}-${String(mes).padStart(2,'0')}`, f607?.filas ?? [],
                      [{ key:'linea',label:'Línea'},{ key:'rncComprador',label:'RNC Comprador'},
                       { key:'encf',label:'eNCF'},{ key:'tipoNcf',label:'Tipo NCF'},
                       { key:'fechaComprobante',label:'Fecha'},{ key:'montoFacturado',label:'Monto'},
                       { key:'itbis',label:'ITBIS'}])}>CSV</Button>
                  <Button size="small" icon={<FilePdfOutlined />} danger disabled={!f607?.filas?.length}
                    onClick={() => descargarPDF(`declaraciones/formato607/pdf?mes=${mes}&anio=${anio}`, `607_${anio}${String(mes).padStart(2,'0')}.pdf`)}>PDF</Button>
                  <Button size="small" icon={<DownloadOutlined />} disabled={!f607?.filas?.length}
                    onClick={() => fetch(`/api/v1/declaraciones/formato607/xml?mes=${mes}&anio=${anio}`, { headers: authHeaders() })
                      .then(r => r.blob()).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `607_${anio}${String(mes).padStart(2,'0')}.xml`; a.click(); URL.revokeObjectURL(a.href); })}>XML</Button>
                </Space>
              }
            >
              <ValidationPanel tipo="607" mes={mes} anio={anio}
                onTxtClick={() => descargarTxt('607', mes, anio, setTxt607)}
                txtCargando={txt607} />
              <Table columns={flt607(cols607)} dataSource={filas607Filtradas} rowKey="linea"
                loading={l7} size="small" scroll={{ x: 850 }}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                summary={() => f607?.totales ? (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}><Text strong>Totales</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={6}><Text strong>{fmt.money(f607.totales.montoFacturado)}</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={7}><Text strong>{fmt.money(f607.totales.itbis)}</Text></Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null} />
            </Card>
          ),
        },

        // ── Formato 608 ───────────────────────────────────────────────────────
        {
          key: 'f608',
          label: <><FileTextOutlined /> Formato 608</>,
          children: (
            <Card
              title={
                <Space>
                  <span>Formato 608 — Comprobantes Anulados</span>
                  {f608 && <Tag color="red">{(f608.comprobantes ?? f608.filas ?? []).length} anulados</Tag>}
                </Space>
              }
              extra={
                <Space>
                  <Button size="small" icon={<DownloadOutlined />}
                    disabled={!(f608?.comprobantes ?? f608?.filas ?? []).length}
                    onClick={() => exportCSV(`Formato608-${anio}-${String(mes).padStart(2,'0')}`,
                      f608?.comprobantes ?? f608?.filas ?? [],
                      [{ key:'folio',label:'NCF'},{ key:'tipoNcf',label:'Tipo NCF'},
                       { key:'fecha',label:'Fecha'},{ key:'fechaCancelacion',label:'Fecha Anulación'},
                       { key:'total',label:'Monto'}])}>CSV</Button>
                  <Button size="small" icon={<DownloadOutlined />}
                    disabled={!(f608?.comprobantes ?? f608?.filas ?? []).length}
                    onClick={() => fetch(`/api/v1/declaraciones/formato608/xml?mes=${mes}&anio=${anio}`, { headers: authHeaders() })
                      .then(r => r.blob()).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `608_${anio}${String(mes).padStart(2,'0')}.xml`; a.click(); URL.revokeObjectURL(a.href); })}>XML</Button>
                </Space>
              }
            >
              <ValidationPanel tipo="608" mes={mes} anio={anio}
                onTxtClick={() => descargarTxt('608', mes, anio, setTxt608)}
                txtCargando={txt608} />
              <Table
                columns={[
                  { title: '#', width: 45, render: (_: any,__: any, i: number) => i + 1 },
                  { title: 'NCF', dataIndex: 'folio', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text> },
                  { title: 'Tipo NCF', dataIndex: 'tipoNcf', width: 80 },
                  { title: 'Fecha Emisión', dataIndex: 'fecha', width: 120, render: (v: any) => v ? new Date(v).toLocaleDateString('es-DO') : '—' },
                  { title: 'Fecha Anulación', dataIndex: 'fechaCancelacion', width: 130, render: (v: any) => v ? new Date(v).toLocaleDateString('es-DO') : '—' },
                  { title: 'Monto', dataIndex: 'total', align: 'right' as const, render: (v: any) => fmt.money(Number(v || 0)) },
                ]}
                dataSource={f608?.comprobantes ?? f608?.filas ?? []}
                rowKey={(r: any) => r.folio ?? r.id ?? Math.random()}
                loading={l8} size="small"
                pagination={{ pageSize: 20, showSizeChanger: false }}
                locale={{ emptyText: 'Sin comprobantes anulados en el período' }}
              />
            </Card>
          ),
        },

        // ── Historial ────────────────────────────────────────────────────────
        {
          key: 'historial',
          label: <><HistoryOutlined /> Historial</>,
          children: (
            <Card title={
              <Space>
                <HistoryOutlined />
                <span>Historial de Reportes DGII Generados</span>
                <Tag>Últimos 12</Tag>
              </Space>
            }>
              <HistorialPanel mes={mes} anio={anio} />
            </Card>
          ),
        },

        // ── Resumen Anual ─────────────────────────────────────────────────────
        {
          key: 'anual',
          label: <><BarChartOutlined /> Año {anio}</>,
          children: (
            <>
              {anual && (
                <>
                  <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col xs={24} md={8}>
                      <Card size="small"><Statistic title={`Total ventas ${anio}`}
                        value={anual.totales.ventas} formatter={v => fmt.money(Number(v))}
                        valueStyle={{ color: '#1677ff' }} /></Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small"><Statistic title={`Total compras ${anio}`}
                        value={anual.totales.compras} formatter={v => fmt.money(Number(v))}
                        valueStyle={{ color: '#7c3aed' }} /></Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small"><Statistic title="ITBIS neto anual"
                        value={anual.totales.itbisNeto} formatter={v => fmt.money(Number(v))}
                        valueStyle={{ color: '#ef4444' }} /></Card>
                    </Col>
                  </Row>
                  <Card title="ITBIS mensual — débito vs crédito vs neto">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={anual.resumen.map((m: any) => ({
                        mes:     MESES.find(x => x.value === m.mes)?.label.slice(0, 3) ?? m.mes,
                        Débito:  m.itbisDebito,
                        Crédito: m.itbisCredito,
                        Neto:    m.itbisNeto,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <RTooltip formatter={(v: number) => fmt.money(v)} />
                        <Legend />
                        <Bar dataKey="Débito"  fill="#ef4444" radius={[4,4,0,0]} />
                        <Bar dataKey="Crédito" fill="#10b981" radius={[4,4,0,0]} />
                        <Bar dataKey="Neto"    fill="#1677ff" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Estado por mes" style={{ marginTop: 16 }}>
                    <Row gutter={[8, 8]}>
                      {anual.resumen.map((m: any) => (
                        <Col xs={12} sm={8} md={4} key={m.mes}>
                          <div style={{
                            padding: '10px 12px', borderRadius: 8, textAlign: 'center',
                            background: m.estado === 'A PAGAR' ? token.colorErrorBg : token.colorSuccessBg,
                            border: `1px solid ${m.estado === 'A PAGAR' ? '#fca5a5' : '#86efac'}`,
                          }}>
                            <Text style={{ fontSize: 11, display: 'block' }}>
                              {MESES.find(x => x.value === m.mes)?.label.slice(0, 3)}
                            </Text>
                            <Text strong style={{ fontSize: 13, color: m.estado === 'A PAGAR' ? '#ef4444' : '#10b981' }}>
                              {fmt.money(m.itbisNeto)}
                            </Text>
                            <div>
                              <Tag color={m.estado === 'A PAGAR' ? 'red' : 'green'}
                                style={{ fontSize: 9, padding: '0 4px', marginTop: 4 }}>
                                {m.estado === 'A PAGAR' ? 'Pagar' : 'A favor'}
                              </Tag>
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                </>
              )}
            </>
          ),
        },
      ]} />
    </div>
  );
}
