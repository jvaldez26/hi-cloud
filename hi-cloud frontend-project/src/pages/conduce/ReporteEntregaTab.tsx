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
  Empty, Typography, Space, Divider,
} from 'antd';
// Space.Compact está en antd 5 como componente separado
const { Compact } = Space;
import {
  SearchOutlined, PrinterOutlined, FileExcelOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;

const fmt = {
  num: (n: number) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  money: (n: number) => `RD$${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  fecha: (d: any) => d ? dayjs(d).format('DD/MM/YYYY') : '—',
  fechaHora: (d: any) => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '—',
};

// ── Estado general ────────────────────────────────────────────────────────────
const ESTADO_CHIP: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  SIN_ENTREGAS: { color: 'default', label: 'Sin Entregas', icon: <MinusCircleOutlined /> },
  PARCIAL:      { color: 'warning', label: 'Parcial',      icon: <ClockCircleOutlined /> },
  COMPLETA:     { color: 'success', label: 'Completa',     icon: <CheckCircleOutlined /> },
};

// ── Estado por línea ──────────────────────────────────────────────────────────
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

// ── Tipos ─────────────────────────────────────────────────────────────────────
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
  observacionesEntrega?: string;
  fechaEntregaReal?: string;
  entregadoPorNombre?: string;
  detalles: Array<{
    productoId?: number | null;
    descripcion: string;
    cantidad: number;
    cantidadDevuelta: number;
    unidadMedida: string;
    observaciones?: string | null;
  }>;
}

interface ReporteEntrega {
  tipo: 'factura' | 'conduce_sin_factura';
  busqueda: string;
  mensaje?: string;
  factura?: {
    id: number;
    folio: string;
    encf?: string | null;
    fecha: string;
    estado: string;
    total: number;
    cliente: { id: number; nombre: string; rnc?: string | null; direccion?: string | null; telefono?: string | null };
  };
  estadoGeneral: 'SIN_ENTREGAS' | 'PARCIAL' | 'COMPLETA';
  hayEnTransito: boolean;
  porcentajeEntregado: number;
  lineas: Linea[];
  lineasLibres: Array<{
    descripcion: string; unidadMedida: string;
    cantidadTotal: number; conduceNumero: string; conduceEstado: string;
  }>;
  conduces: ConduceReporte[];
  valorPendienteTotal: number;
  valorEnTransitoTotal: number;
  // conduce suelto
  conduce?: any;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ReporteEntregaTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam    = searchParams.get('q') ?? '';
  const [input,   setInput]   = useState(qParam);
  const [loading, setLoading] = useState(false);
  const [reporte, setReporte] = useState<ReporteEntrega | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Cargar cuando hay `q` en la URL al montar
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
      setReporte(data);
      // Sincronizar URL
      setSearchParams(p => { p.set('q', term); return p; }, { replace: true });
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!reporte?.factura) return;
    const f = reporte.factura;
    const rows: Record<string, any>[] = [];

    rows.push({ '': `Reporte de Entrega — ${f.folio}`, ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({ '': `Cliente: ${f.cliente.nombre}`, ' ': `RNC: ${f.cliente.rnc ?? '—'}`, '  ': '', '   ': '', '    ': '', '     ': '' });
    if (f.encf) rows.push({ '': `e-NCF: ${f.encf}`, ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({ '': `Estado: ${reporte.estadoGeneral}`, ' ': `% Entregado: ${reporte.porcentajeEntregado}%`, '  ': '', '   ': '', '    ': '', '     ': '' });
    rows.push({});

    rows.push({
      '': 'PRODUCTO', ' ': 'UNIDAD', '  ': 'FACTURADO',
      '   ': 'ENTREGADO', '    ': 'EN TRÁNSITO', '     ': 'PENDIENTE', '      ': 'ESTADO',
    });
    for (const l of reporte.lineas) {
      rows.push({
        '': l.descripcion, ' ': l.unidadMedida,
        '  ': l.cantidadFacturada, '   ': l.cantidadEntregada,
        '    ': l.cantidadEnTransito, '     ': l.cantidadPendiente, '      ': l.estadoLinea,
      });
    }

    if (reporte.conduces.length > 0) {
      rows.push({});
      rows.push({ '': 'CONDUCES EMITIDOS', ' ': '', '  ': '', '   ': '', '    ': '', '     ': '' });
      rows.push({ '': 'Número', ' ': 'Fecha', '  ': 'Estado', '   ': 'Conductor', '    ': 'Contacto', '     ': 'Observaciones' });
      for (const c of reporte.conduces) {
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

    exportarExcel(rows, `Reporte-Entrega-${f.folio}-${dayjs().format('YYYY-MM-DD')}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="reporte-entrega-root">
      {/* Estilos de impresión */}
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
        <Empty description={
          <span>No se encontró ninguna factura, conduce o e-NCF con el término <strong>"{input}"</strong></span>
        } />
      )}

      {!loading && reporte && (
        <>
          {/* ── Cabecera del reporte ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              {reporte.tipo === 'conduce_sin_factura' ? (
                <>
                  <Title level={4} style={{ margin: 0 }}>Conduce {reporte.conduce?.numero}</Title>
                  <Text type="secondary">{reporte.conduce?.clienteNombre}</Text>
                </>
              ) : reporte.factura ? (
                <>
                  <Space align="center" style={{ marginBottom: 4 }}>
                    <Title level={4} style={{ margin: 0 }}>{reporte.factura.folio}</Title>
                    {reporte.factura.encf && <Text code style={{ fontSize: 12 }}>{reporte.factura.encf}</Text>}
                    <Tag
                      color={ESTADO_CHIP[reporte.estadoGeneral]?.color}
                      icon={ESTADO_CHIP[reporte.estadoGeneral]?.icon}
                      style={{ fontSize: 13, padding: '2px 10px' }}
                    >
                      {ESTADO_CHIP[reporte.estadoGeneral]?.label}
                    </Tag>
                  </Space>
                  <div>
                    <Text strong>{reporte.factura.cliente.nombre}</Text>
                    {reporte.factura.cliente.rnc && <Text type="secondary" style={{ marginLeft: 8 }}>RNC: {reporte.factura.cliente.rnc}</Text>}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Fecha: {fmt.fecha(reporte.factura.fecha)} · Total: {fmt.money(reporte.factura.total)}
                    {reporte.factura.cliente.telefono ? ` · Tel: ${reporte.factura.cliente.telefono}` : ''}
                  </Text>
                </>
              ) : null}
            </div>
            <Space className="no-print">
              <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={reporte.tipo === 'conduce_sin_factura'}>Excel</Button>
              <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Imprimir</Button>
            </Space>
          </div>

          {/* ── Conduce suelto (sin factura) ── */}
          {reporte.tipo === 'conduce_sin_factura' && (
            <Alert
              type="info"
              showIcon
              message={reporte.mensaje}
              style={{ marginBottom: 16 }}
            />
          )}

          {/* ── Progreso ── */}
          {reporte.tipo === 'factura' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 8 }}>
                <div><Text type="secondary" style={{ fontSize: 12 }}>Entregado</Text><div><Text strong style={{ fontSize: 18 }}>{reporte.porcentajeEntregado}%</Text></div></div>
                {reporte.valorPendienteTotal > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>Valor pendiente</Text><div><Text strong style={{ fontSize: 18, color: '#d97706' }}>{fmt.money(reporte.valorPendienteTotal)}</Text></div></div>}
                {reporte.hayEnTransito && reporte.valorEnTransitoTotal > 0 && <div><Text type="secondary" style={{ fontSize: 12 }}>En tránsito</Text><div><Text strong style={{ fontSize: 18, color: '#2563eb' }}>{fmt.money(reporte.valorEnTransitoTotal)}</Text></div></div>}
                <div><Text type="secondary" style={{ fontSize: 12 }}>Conduces emitidos</Text><div><Text strong style={{ fontSize: 18 }}>{reporte.conduces.length}</Text></div></div>
              </div>
              <Progress percent={reporte.porcentajeEntregado} strokeColor={reporte.estadoGeneral === 'COMPLETA' ? '#10b981' : '#f59e0b'} style={{ maxWidth: 400 }} />
            </div>
          )}

          {/* ── Tabla por producto ── */}
          {reporte.tipo === 'factura' && reporte.lineas.length > 0 && (
            <>
              <Title level={5} style={{ marginBottom: 8 }}>Detalle por Producto</Title>
              <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                <Table
                  dataSource={reporte.lineas}
                  rowKey="descripcion"
                  pagination={false}
                  size="small"
                  rowClassName={(r: Linea) => r.estadoLinea === 'EXCEDIDO' ? 'ant-table-row-danger' : ''}
                  style={{ marginBottom: 0 }}
                  columns={[
                    {
                      title: 'Producto',
                      dataIndex: 'descripcion',
                      key: 'desc',
                      ellipsis: true,
                    },
                    {
                      title: 'U.M.',
                      dataIndex: 'unidadMedida',
                      key: 'um',
                      width: 60,
                      align: 'center' as const,
                    },
                    {
                      title: 'Facturado',
                      dataIndex: 'cantidadFacturada',
                      key: 'fact',
                      width: 90,
                      align: 'right' as const,
                      render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>,
                    },
                    {
                      title: 'Entregado',
                      dataIndex: 'cantidadEntregada',
                      key: 'entr',
                      width: 90,
                      align: 'right' as const,
                      render: (v: number) => <Text style={{ color: v > 0 ? '#10b981' : undefined, fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>,
                    },
                    ...(reporte.hayEnTransito ? [{
                      title: 'En Tránsito',
                      dataIndex: 'cantidadEnTransito',
                      key: 'trans',
                      width: 100,
                      align: 'right' as const,
                      render: (v: number) => v > 0 ? <Text style={{ color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text> : <Text type="secondary">—</Text>,
                    }] : []),
                    {
                      title: <span style={{ color: '#d97706' }}>Pendiente</span>,
                      dataIndex: 'cantidadPendiente',
                      key: 'pend',
                      width: 90,
                      align: 'right' as const,
                      render: (v: number, r: Linea) => {
                        const color = r.estadoLinea === 'EXCEDIDO' ? '#dc2626'
                                    : v > 0 ? '#d97706' : '#10b981';
                        return <Text strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{fmt.num(v)}</Text>;
                      },
                    },
                    {
                      title: 'Estado',
                      dataIndex: 'estadoLinea',
                      key: 'estado',
                      width: 100,
                      align: 'center' as const,
                      render: (v: string) => (
                        <Tag color={LINEA_TAG[v]?.color}>{LINEA_TAG[v]?.label ?? v}</Tag>
                      ),
                    },
                  ]}
                />
              </div>

              {/* Líneas con excedido */}
              {reporte.lineas.some(l => l.estadoLinea === 'EXCEDIDO') && (
                <Alert
                  type="error"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="Hay líneas con cantidad excedida"
                  description="Se entregó más de lo facturado en uno o más productos. Verificar con el equipo de despacho."
                  style={{ marginBottom: 16 }}
                />
              )}
            </>
          )}

          {/* ── Líneas libres ── */}
          {reporte.tipo === 'factura' && reporte.lineasLibres.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Divider orientation="left"><Text type="secondary" style={{ fontSize: 13 }}>Líneas sin producto (no descuentan pendiente)</Text></Divider>
              <Table
                dataSource={reporte.lineasLibres}
                rowKey={(r, i) => `${r.conduceNumero}-${i}`}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                  { title: 'Cantidad', dataIndex: 'cantidadTotal', key: 'c', width: 80, align: 'right' as const },
                  { title: 'U.M.', dataIndex: 'unidadMedida', key: 'u', width: 60 },
                  { title: 'Conduce', dataIndex: 'conduceNumero', key: 'n', width: 110, render: (v: string, r: any) => <><Text code style={{ fontSize: 11 }}>{v}</Text> <Tag color={r.conduceEstado === 'entregado' ? 'success' : 'default'} style={{ fontSize: 10 }}>{CONDUCE_ESTADO[r.conduceEstado] ?? r.conduceEstado}</Tag></> },
                ]}
              />
            </div>
          )}

          {/* ── Conduces emitidos ── */}
          {reporte.conduces.length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <Title level={5} style={{ marginBottom: 8 }}>Conduces Emitidos ({reporte.conduces.length})</Title>
              <Collapse
                size="small"
                items={reporte.conduces.map((c: ConduceReporte) => ({
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
                      {/* Datos de la entrega */}
                      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 12 }}>
                        {c.conductor && <div><Text type="secondary" style={{ fontSize: 11 }}>Conductor</Text><div><Text>{c.conductor}{c.vehiculo ? ` · ${c.vehiculo}` : ''}</Text></div></div>}
                        {c.contactoEntrega && <div><Text type="secondary" style={{ fontSize: 11 }}>Recibido por</Text><div><Text>{c.contactoEntrega}{c.telefonoContacto ? ` · ${c.telefonoContacto}` : ''}</Text></div></div>}
                        {c.entregadoPorNombre && <div><Text type="secondary" style={{ fontSize: 11 }}>Entregado por</Text><div><Text>{c.entregadoPorNombre}</Text></div></div>}
                        {c.fechaEntregaReal && <div><Text type="secondary" style={{ fontSize: 11 }}>Fecha real de entrega</Text><div><Text>{fmt.fechaHora(c.fechaEntregaReal)}</Text></div></div>}
                      </div>

                      {/* Detalles del conduce */}
                      <Table
                        dataSource={c.detalles}
                        rowKey={(_, i) => String(i)}
                        pagination={false}
                        size="small"
                        style={{ marginBottom: 8 }}
                        columns={[
                          { title: 'Ítem', dataIndex: 'descripcion', key: 'd', ellipsis: true },
                          { title: 'Cantidad', dataIndex: 'cantidad', key: 'c', width: 90, align: 'right' as const, render: (v: number) => fmt.num(v) },
                          { title: 'Devuelto', dataIndex: 'cantidadDevuelta', key: 'dev', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Text style={{ color: '#dc2626' }}>{fmt.num(v)}</Text> : <Text type="secondary">—</Text> },
                          { title: 'U.M.', dataIndex: 'unidadMedida', key: 'u', width: 60 },
                          { title: 'Nota', dataIndex: 'observaciones', key: 'obs', ellipsis: true, render: (v: string | null) => v ?? '—' },
                        ]}
                      />

                      {/* Comentarios del conduce */}
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
          ) : reporte.tipo === 'factura' ? (
            <Alert
              type="info"
              showIcon
              message="Sin entregas registradas"
              description="Esta factura no tiene ningún conduce emitido. La cantidad pendiente es el 100% de lo facturado."
              style={{ marginBottom: 16 }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
