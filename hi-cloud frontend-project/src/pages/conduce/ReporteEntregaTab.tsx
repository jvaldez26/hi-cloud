/**
 * ReporteEntregaTab
 * Pestaña del módulo de Conduces que muestra el estado completo de entrega
 * de una factura — lo entregado, en tránsito, pendiente y los conduces emitidos.
 *
 * URL: /conduces?tab=reporte&q=FAC-155
 * Acepta: número de conduce, folio de factura o e-NCF.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Input, Button, Spin, Tag, Table, Alert, Collapse, Progress,
  Empty, Typography, Space, Divider, message,
} from 'antd';
import {
  SearchOutlined, PrinterOutlined, FileExcelOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';
import { exportarExcel } from '../../utils/exportExcel';
// Misma plantilla térmica que usa el POS para imprimir conduces — ver
// utils/docTermico. Compartirla es lo que garantiza que el ticket sea idéntico.
import { imprimirConduceTermico, abrirConducePDF } from '../../utils/imprimirConduce';
import { dRD } from '../../utils/fechaRD';

const { Compact } = Space;
const { Title, Text } = Typography;

const fmt = {
  num:      (n: number) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  money:    (n: number) => `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  fecha:    (d: any)    => d ? dayjs(d).format('DD/MM/YYYY') : '—',
  fechaHora:(d: any)    => d ? dRD(d).format('DD/MM/YYYY HH:mm') : '—',
};

// ── Mapas de estado ───────────────────────────────────────────────────────────
type EstadoEntrega = 'SIN_ENTREGAS' | 'PARCIAL' | 'COMPLETA';

const ESTADO_CHIP: Record<EstadoEntrega, { color: string; label: string; icon: React.ReactNode }> = {
  SIN_ENTREGAS: { color: 'default', label: 'Sin Entregas', icon: <MinusCircleOutlined /> },
  PARCIAL:      { color: 'warning', label: 'Parcial',      icon: <ClockCircleOutlined /> },
  COMPLETA:     { color: 'success', label: 'Completa',     icon: <CheckCircleOutlined /> },
};

const LINEA_TAG: Record<string, { color: string; label: string }> = {
  COMPLETO:  { color: 'success', label: 'Completo'  },
  PARCIAL:   { color: 'warning', label: 'Parcial'   },
  PENDIENTE: { color: 'default', label: 'Pendiente' },
  EXCEDIDO:  { color: 'error',   label: 'Excedido'  },
};

const CONDUCE_ESTADO: Record<string, string> = {
  generado:    'Generado',
  en_transito: 'En Tránsito',
  entregado:   'Entregado',
  devuelto:    'Devuelto',
};

// ── Tipos — unión discriminada ────────────────────────────────────────────────
interface Linea {
  productoId?: number | null;
  descripcion: string;
  unidadMedida: string;
  cantidadFacturada: number;
  cantidadEntregada: number;
  cantidadEnTransito: number;
  cantidadDevuelta: number;
  cantidadPendiente: number;
  precioUnitario: number;
  valorPendiente: number;
  estadoLinea: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'EXCEDIDO';
}

interface LineaLibre {
  descripcion: string;
  unidadMedida: string;
  cantidadTotal: number;
  conduceNumero: string;
  conduceEstado: string;
}

interface DetalleConduce {
  productoId?: number | null;
  descripcion: string;
  cantidad: number;
  cantidadDevuelta: number;
  unidadMedida: string;
  observaciones?: string | null;
}

interface ConduceReporte {
  id: number;
  numero: string;
  fecha: string;
  estado: string;
  conductor?: string;
  vehiculo?: string;
  contactoEntrega?: string;
  telefonoContacto?: string;
  notas?: string;
  /** Nota de la ENTREGA. El motivo de la devolución es motivoDevolucion. */
  observacionesEntrega?: string;
  fechaEntregaReal?: string;
  entregadoPorNombre?: string;
  motivoDevolucion?: string | null;
  devueltoPorNombre?: string | null;
  fechaDevolucion?: string | null;
  detalles: DetalleConduce[];
}

interface ClienteReporte {
  id: number;
  nombre: string;
  rnc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
}

interface Candidato {
  tipo: 'factura' | 'conduce_sin_factura';
  id: number;
  referencia: string;
  encf?: string | null;
  clienteNombre: string;
  fecha: string;
  total?: number;
  estado: string;
}

// Los tres brazos de la respuesta — sin campos opcionales cruzados
interface RespuestaCandidatos {
  tipo: 'candidatos';
  busqueda: string;
  candidatos: Candidato[];
}

interface RespuestaFactura {
  tipo: 'factura';
  busqueda: string;
  factura: { id: number; folio: string; encf?: string | null; fecha: string; estado: string; total: number; cliente: ClienteReporte };
  estadoGeneral: EstadoEntrega;
  hayEnTransito: boolean;
  porcentajeEntregado: number;
  lineas: Linea[];
  lineasLibres: LineaLibre[];
  conduces: ConduceReporte[];
  valorPendienteTotal: number;
  valorEnTransitoTotal: number;
}

interface RespuestaConduceSuelto {
  tipo: 'conduce_sin_factura';
  busqueda: string;
  mensaje: string;
  conduce: ConduceReporte & { clienteNombre: string };
}

/**
 * Bloque de devolución — el mismo en la vista de factura y en la de conduce
 * suelto. Quien mira este reporte y ve un conduce devuelto se pregunta
 * exactamente esto, así que va marcado y no en una nota al pie.
 */
function BloqueDevolucion({ c }: { c: ConduceReporte }) {
  if (c.estado !== 'devuelto') return null;
  return (
    <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca',
      borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
      <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 4 }}>↩️ DEVOLUCIÓN</div>
      <div><Text>{(c.motivoDevolucion ?? '').trim() || 'Motivo no registrado'}</Text></div>
      <div style={{ marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Registrada por {c.devueltoPorNombre || '—'}
          {c.fechaDevolucion ? ` · ${fmt.fechaHora(c.fechaDevolucion)}` : ''}
        </Text>
      </div>
    </div>
  );
}

type RespuestaReporte = RespuestaCandidatos | RespuestaFactura | RespuestaConduceSuelto;

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReporteEntregaTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam    = searchParams.get('q') ?? '';
  const [input,   setInput]   = useState(qParam);
  const [loading, setLoading] = useState(false);
  const [reporte, setReporte] = useState<RespuestaReporte | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (qParam) buscar(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = async (q?: string) => {
    const term = (q ?? input).trim();
    if (!term) return;
    setLoading(true);
    setNotFound(false);
    setReporte(null);
    try {
      const res = await api.get(`/conduces/reporte-entrega?q=${encodeURIComponent(term)}`);
      const data = (res as any).data?.data ?? (res as any).data;
      if (!data) { setNotFound(true); return; }
      setReporte(data as RespuestaReporte);
      setSearchParams(p => { p.set('q', term); return p; }, { replace: true });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Impresión — el mismo camino que el módulo y el POS ───────────────────
  //
  // Estas quince líneas estaban copiadas aquí, en el panel del POS y en el
  // módulo. Ahora viven en utils/imprimirConduce y las tres pantallas llaman
  // a la misma función, así que el ticket no puede volver a divergir.
  const [imprimiendo, setImprimiendo] = useState<number | null>(null);

  const imprimirTermico = async (conduceId: number) => {
    setImprimiendo(conduceId);
    try { await imprimirConduceTermico(conduceId); }
    finally { setImprimiendo(null); }
  };

  const abrirPDF = abrirConducePDF;

  // ── Export Excel (solo disponible para tipo 'factura') ────────────────────
  const exportExcel = () => {
    if (!reporte || reporte.tipo !== 'factura') return;
    const { factura, lineas, conduces, estadoGeneral, porcentajeEntregado } = reporte;
    const rows: Record<string, any>[] = [];

    rows.push({ '': `Reporte de Entrega — ${factura.folio}`, ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({ '': `Cliente: ${factura.cliente.nombre}`, ' ': `RNC: ${factura.cliente.rnc ?? '—'}`, '  ': '', '   ': '', '    ': '', '     ': '' });
    if (factura.encf) rows.push({ '': `e-NCF: ${factura.encf}`, ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({ '': `Estado: ${estadoGeneral}`, ' ': `% Entregado: ${porcentajeEntregado}%`, '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({});

    rows.push({
      '': 'PRODUCTO', ' ': 'UNIDAD', '  ': 'FACTURADO',
      '   ': 'ENTREGADO', '    ': 'EN TRÁNSITO', '     ': 'PENDIENTE', '      ': 'ESTADO',
    });
    for (const l of lineas) {
      rows.push({
        '': l.descripcion, ' ': l.unidadMedida,
        '  ': l.cantidadFacturada, '   ': l.cantidadEntregada,
        '    ': l.cantidadEnTransito, '     ': l.cantidadPendiente, '      ': l.estadoLinea,
      });
    }

    if (conduces.length > 0) {
      rows.push({});
      rows.push({ '': 'CONDUCES EMITIDOS', ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
      rows.push({ '': 'Número', ' ': 'Fecha', '  ': 'Estado', '   ': 'Conductor', '    ': 'Contacto', '     ': 'Observaciones' });
      for (const c of conduces) {
        rows.push({
          '': c.numero, ' ': fmt.fecha(c.fecha), '  ': CONDUCE_ESTADO[c.estado] ?? c.estado,
          '   ': c.conductor ?? '—', '    ': c.contactoEntrega ?? '—',
          '     ': c.observacionesEntrega ?? c.notas ?? '—',
        });
        for (const d of c.detalles) {
          rows.push({
            '': `  → ${d.descripcion}`, ' ': d.unidadMedida,
            '  ': d.cantidad, '   ': `Devuelto: ${d.cantidadDevuelta}`, '    ': '', '     ': d.observaciones ?? '',
          });
        }
      }
    }

    exportarExcel(rows, `Reporte-Entrega-${factura.folio}-${dayjs().format('YYYY-MM-DD')}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="reporte-entrega-root">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .reporte-entrega-root { padding: 0; }
          .ant-collapse-content { display: block !important; }
        }
      `}</style>

      {/* ── Buscador ── */}
      <div className="no-print" style={{ maxWidth: 560, marginBottom: 24 }}>
        <Compact style={{ width: '100%' }}>
          <Input
            placeholder="Buscar por N° conduce, folio factura o e-NCF (ej. CON-3, FAC-155)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onPressEnter={() => buscar()}
            allowClear
            onClear={() => { setInput(''); setReporte(null); setNotFound(false); setSearchParams(p => { p.delete('q'); return p; }); }}
            size="large"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => buscar()}
            size="large"
            loading={loading}
          >
            Buscar
          </Button>
        </Compact>
      </div>

      {loading && <Spin size="large" style={{ display: 'block', margin: '60px auto' }} />}

      {!loading && notFound && (
        <Empty
          description={
            <span>
              No se encontró nada con <strong>"{input}"</strong> en esta empresa.<br />
              <span style={{ fontSize: 12, color: '#888' }}>
                Puedes buscar por número de factura (FAC-418 o solo 418), número de conduce (CON-12) o e-NCF completo (E320000000418).
              </span>
            </span>
          }
        />
      )}

      {/* ── Múltiples candidatos → tabla de selección ── */}
      {!loading && reporte?.tipo === 'candidatos' && (
        <div style={{ maxWidth: 700 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Se encontraron <strong>{reporte.candidatos.length}</strong> resultados para <strong>"{reporte.busqueda}"</strong>. Selecciona el que deseas ver:
          </Text>
          <Table
            dataSource={reporte.candidatos}
            rowKey={r => `${r.tipo}-${r.id}`}
            size="small"
            pagination={false}
            onRow={r => ({
              style: { cursor: 'pointer' },
              onClick: () => { setInput(r.referencia); buscar(r.referencia); },
            })}
            columns={[
              {
                title: 'Referencia',
                key: 'ref',
                render: (_: any, r: Candidato) => (
                  <Space size={4}>
                    <Text code style={{ fontSize: 12 }}>{r.referencia}</Text>
                    {r.encf && <Text type="secondary" style={{ fontSize: 11 }}>{r.encf}</Text>}
                  </Space>
                ),
              },
              { title: 'Cliente', dataIndex: 'clienteNombre', key: 'c', ellipsis: true },
              { title: 'Fecha', dataIndex: 'fecha', key: 'f', width: 100, render: (v: string) => fmt.fecha(v) },
              {
                title: 'Total',
                dataIndex: 'total',
                key: 't',
                width: 120,
                align: 'right' as const,
                render: (v?: number) => v != null ? fmt.money(v) : '—',
              },
              {
                title: 'Tipo',
                key: 'tipo',
                width: 90,
                render: (_: any, r: Candidato) => (
                  <Tag color={r.tipo === 'factura' ? 'blue' : 'default'}>
                    {r.tipo === 'factura' ? 'Factura' : 'Conduce'}
                  </Tag>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ── Reporte completo (factura o conduce suelto) ── */}
      {!loading && reporte && reporte.tipo !== 'candidatos' && (() => {
        // A partir de aquí TypeScript sabe que reporte es RespuestaFactura | RespuestaConduceSuelto
        const r = reporte;
        return (
          <>
            {/* ── Cabecera ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                {r.tipo === 'conduce_sin_factura' ? (
                  <>
                    <Title level={4} style={{ margin: 0 }}>Conduce {r.conduce.numero}</Title>
                    <Text type="secondary">{r.conduce.clienteNombre}</Text>
                  </>
                ) : (
                  <>
                    <Space align="center" style={{ marginBottom: 4 }}>
                      <Title level={4} style={{ margin: 0 }}>{r.factura.folio}</Title>
                      {r.factura.encf && <Text code style={{ fontSize: 12 }}>{r.factura.encf}</Text>}
                      <Tag
                        color={ESTADO_CHIP[r.estadoGeneral].color}
                        icon={ESTADO_CHIP[r.estadoGeneral].icon}
                        style={{ fontSize: 13, padding: '2px 10px' }}
                      >
                        {ESTADO_CHIP[r.estadoGeneral].label}
                      </Tag>
                    </Space>
                    <div>
                      <Text strong>{r.factura.cliente.nombre}</Text>
                      {r.factura.cliente.rnc && <Text type="secondary" style={{ marginLeft: 8 }}>RNC: {r.factura.cliente.rnc}</Text>}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Fecha: {fmt.fecha(r.factura.fecha)} · Total: {fmt.money(r.factura.total)}
                      {r.factura.cliente.telefono ? ` · Tel: ${r.factura.cliente.telefono}` : ''}
                    </Text>
                  </>
                )}
              </div>
              <Space className="no-print">
                <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={r.tipo === 'conduce_sin_factura'}>Excel</Button>
                <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir</Button>
              </Space>
            </div>

            {/* ── Conduce suelto ── */}
            {r.tipo === 'conduce_sin_factura' && (
              <>
                <BloqueDevolucion c={r.conduce} />
                <Alert type="info" showIcon message={r.mensaje} style={{ marginBottom: 16 }} />
              </>
            )}

            {/* ── Progreso (solo factura) ── */}
            {r.tipo === 'factura' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Entregado</Text><div><Text strong style={{ fontSize: 18 }}>{r.porcentajeEntregado}%</Text></div></div>
                  {r.valorPendienteTotal > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>Valor pendiente</Text><div><Text strong style={{ fontSize: 18, color: '#d97706' }}>{fmt.money(r.valorPendienteTotal)}</Text></div></div>}
                  {r.hayEnTransito && r.valorEnTransitoTotal > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>En tránsito</Text><div><Text strong style={{ fontSize: 18, color: '#2563eb' }}>{fmt.money(r.valorEnTransitoTotal)}</Text></div></div>}
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Conduces emitidos</Text><div><Text strong style={{ fontSize: 18 }}>{r.conduces.length}</Text></div></div>
                </div>
                <Progress percent={r.porcentajeEntregado} strokeColor={r.estadoGeneral === 'COMPLETA' ? '#10b981' : '#f59e0b'} style={{ maxWidth: 400 }} />
              </div>
            )}

            {/* ── Tabla por producto ── */}
            {r.tipo === 'factura' && r.lineas.length > 0 && (
              <>
                <Title level={5} style={{ marginBottom: 8 }}>Detalle por Producto</Title>
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <Table
                    dataSource={r.lineas}
                    rowKey="descripcion"
                    pagination={false}
                    size="small"
                    rowClassName={(l: Linea) => l.estadoLinea === 'EXCEDIDO' ? 'ant-table-row-danger' : ''}
                    style={{ marginBottom: 0 }}
                    columns={[
                      { title: 'Producto',  dataIndex: 'descripcion',      key: 'desc', ellipsis: true },
                      { title: 'U.M.',      dataIndex: 'unidadMedida',     key: 'um',   width: 60, align: 'center' as const },
                      {
                        title: 'Facturado', dataIndex: 'cantidadFacturada', key: 'fact', width: 90, align: 'right' as const,
                        render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>,
                      },
                      {
                        title: 'Entregado', dataIndex: 'cantidadEntregada', key: 'entr', width: 90, align: 'right' as const,
                        render: (v: number) => <Text style={{ color: v > 0 ? '#10b981' : undefined, fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>,
                      },
                      ...(r.hayEnTransito ? [{
                        title: 'En Tránsito', dataIndex: 'cantidadEnTransito', key: 'trans', width: 100, align: 'right' as const,
                        render: (v: number) => v > 0
                          ? <Text style={{ color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>
                          : <Text type="secondary">—</Text>,
                      }] : []),
                      {
                        title: <span style={{ color: '#d97706' }}>Pendiente</span>,
                        dataIndex: 'cantidadPendiente', key: 'pend', width: 90, align: 'right' as const,
                        render: (v: number, l: Linea) => {
                          const color = l.estadoLinea === 'EXCEDIDO' ? '#dc2626' : v > 0 ? '#d97706' : '#10b981';
                          return <Text strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>;
                        },
                      },
                      {
                        title: 'Estado', dataIndex: 'estadoLinea', key: 'estado', width: 100, align: 'center' as const,
                        render: (v: string) => <Tag color={LINEA_TAG[v]?.color}>{LINEA_TAG[v]?.label ?? v}</Tag>,
                      },
                    ]}
                  />
                </div>
                {r.lineas.some(l => l.estadoLinea === 'EXCEDIDO') && (
                  <Alert
                    type="error" showIcon icon={<ExclamationCircleOutlined />}
                    message="Hay líneas con cantidad excedida"
                    description="Se entregó más de lo facturado en uno o más productos. Verificar con el equipo de despacho."
                    style={{ marginBottom: 16 }}
                  />
                )}
              </>
            )}

            {/* ── Líneas libres ── */}
            {r.tipo === 'factura' && r.lineasLibres.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <Divider orientation="left"><Text type="secondary" style={{ fontSize: 13 }}>Líneas sin producto (no descuentan pendiente)</Text></Divider>
                <Table
                  dataSource={r.lineasLibres}
                  rowKey={(l, i) => `${l.conduceNumero}-${i}`}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: 'Descripción', dataIndex: 'descripcion',  key: 'd' },
                    { title: 'Cantidad',    dataIndex: 'cantidadTotal', key: 'c', width: 80, align: 'right' as const },
                    { title: 'U.M.',        dataIndex: 'unidadMedida',  key: 'u', width: 60 },
                    {
                      title: 'Conduce', dataIndex: 'conduceNumero', key: 'n', width: 110,
                      render: (v: string, l: LineaLibre) => (
                        <>
                          <Text code style={{ fontSize: 11 }}>{v}</Text>{' '}
                          <Tag color={l.conduceEstado === 'entregado' ? 'success' : 'default'} style={{ fontSize: 10 }}>
                            {CONDUCE_ESTADO[l.conduceEstado] ?? l.conduceEstado}
                          </Tag>
                        </>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {/* ── Conduces emitidos ── */}
            {r.tipo === 'factura' && (
              r.conduces.length > 0 ? (
                <div style={{ marginBottom: 24 }}>
                  <Title level={5} style={{ marginBottom: 8 }}>Conduces Emitidos ({r.conduces.length})</Title>
                  <Collapse
                    size="small"
                    items={r.conduces.map((c: ConduceReporte) => ({
                      key: String(c.id),
                      label: (
                        <Space>
                          <Text code style={{ fontSize: 12 }}>{c.numero}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{fmt.fecha(c.fecha)}</Text>
                          <Tag color={c.estado === 'entregado' ? 'success' : c.estado === 'en_transito' ? 'processing' : c.estado === 'devuelto' ? 'error' : 'default'}>
                            {CONDUCE_ESTADO[c.estado] ?? c.estado}
                          </Tag>
                          {c.conductor && <Text type="secondary" style={{ fontSize: 12 }}>🚗 {c.conductor}</Text>}
                          {c.contactoEntrega && <Text type="secondary" style={{ fontSize: 12 }}>👤 {c.contactoEntrega}</Text>}
                        </Space>
                      ),
                      children: (
                        <div>
                          {/* Botones de impresión */}
                          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
                            <Button
                              size="small"
                              icon={<PrinterOutlined />}
                              loading={imprimiendo === c.id}
                              onClick={() => imprimirTermico(c.id)}
                            >
                              🖨️ Térmica
                            </Button>
                            <Button
                              size="small"
                              icon={<PrinterOutlined />}
                              onClick={() => abrirPDF(c.id)}
                            >
                              📄 Carta
                            </Button>
                          </div>
                          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 12 }}>
                            {c.conductor && <div><Text type="secondary" style={{ fontSize: 11 }}>Conductor</Text><div><Text>{c.conductor}{c.vehiculo ? ` · ${c.vehiculo}` : ''}</Text></div></div>}
                            {c.contactoEntrega && <div><Text type="secondary" style={{ fontSize: 11 }}>Recibido por</Text><div><Text>{c.contactoEntrega}{c.telefonoContacto ? ` · ${c.telefonoContacto}` : ''}</Text></div></div>}
                            {c.entregadoPorNombre && <div><Text type="secondary" style={{ fontSize: 11 }}>Entregado por</Text><div><Text>{c.entregadoPorNombre}</Text></div></div>}
                            {c.fechaEntregaReal && <div><Text type="secondary" style={{ fontSize: 11 }}>Fecha real de entrega</Text><div><Text>{fmt.fechaHora(c.fechaEntregaReal)}</Text></div></div>}
                          </div>
                          <Table
                            dataSource={c.detalles}
                            rowKey={(_, i) => String(i)}
                            pagination={false}
                            size="small"
                            style={{ marginBottom: 8 }}
                            columns={[
                              { title: 'Ítem',     dataIndex: 'descripcion',     key: 'd', ellipsis: true },
                              { title: 'Cantidad', dataIndex: 'cantidad',         key: 'c', width: 90, align: 'right' as const, render: (v: number) => fmt.num(v) },
                              { title: 'Devuelto', dataIndex: 'cantidadDevuelta', key: 'dev', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Text style={{ color: '#dc2626' }}>{fmt.num(v)}</Text> : <Text type="secondary">—</Text> },
                              { title: 'U.M.',     dataIndex: 'unidadMedida',     key: 'u', width: 60 },
                              { title: 'Nota',     dataIndex: 'observaciones',    key: 'obs', ellipsis: true, render: (v: string | null) => v ?? '—' },
                            ]}
                          />
                          <BloqueDevolucion c={c} />
                          {(c.notas || c.observacionesEntrega) && (
                            <div style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 12 }}>
                              {c.notas && <div><Text type="secondary">Notas: </Text><Text>{c.notas}</Text></div>}
                              {c.observacionesEntrega && <div><Text type="secondary">Observaciones de entrega: </Text><Text>{c.observacionesEntrega}</Text></div>}
                            </div>
                          )}
                        </div>
                      ),
                    }))}
                  />
                </div>
              ) : (
                <Alert
                  type="info" showIcon
                  message="Sin entregas registradas"
                  description="Esta factura no tiene ningún conduce emitido. La cantidad pendiente es el 100% de lo facturado."
                  style={{ marginBottom: 16 }}
                />
              )
            )}
          </>
        );
      })()}
    </div>
  );
}
