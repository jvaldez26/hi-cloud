import { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import {
  Table, Tag, Button, Modal, Select, InputNumber, message,
  Avatar, Tooltip, Input, Popconfirm, Form, Tabs, Badge, Dropdown,
  Spin, Empty, Space, Alert, ConfigProvider, theme as antTheme, DatePicker,
} from 'antd';
import type { MenuProps } from 'antd';
import { ecfConfigApi } from '../../api/ecf-config.api';
import EcfBadge, { type EstadoEcf } from '../../components/ui/EcfBadge';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  Building2, Users, FileText, DollarSign, Clock as ClockIcon, AlertTriangle,
  XCircle, BarChart2, Globe, LogOut, RefreshCw, Search,
  Eye, Edit2, MessageSquare, PauseCircle, PlayCircle, Trash2,
  Crown, Settings, Moon, Sun,
  CheckCircle, Send, Shield, Bell, MoreHorizontal,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { demoApi, ESTADO_DEMO_LABEL, ESTADO_DEMO_COLOR } from '../../api/demo.api';
import CobrosPage from './CobrosPage';
import { SECTORES_EMPRESARIALES } from '../../constants/sectores';

/** Wrapper con contexto de color del Super Admin — respeta modo oscuro */
function CobrosAdminPanel() {
  const C = useSaTheme();
  const isDark = C.bg === SA_DARK.bg;
  return (
    <ConfigProvider theme={{ algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm }}>
      <CobrosPage />
    </ConfigProvider>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function xd(r: any) { return r?.data?.data ?? r?.data ?? r; }

function fmtFecha(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtRelativa(v: string | null | undefined): { texto: string; color: string } {
  if (!v) return { texto: '—', color: '#64748B' };
  const dias = Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000);
  if (dias < 0)  return { texto: `Venció hace ${Math.abs(dias)}d`, color: '#EF4444' };
  if (dias === 0) return { texto: 'Vence hoy', color: '#EF4444' };
  if (dias <= 7)  return { texto: `Vence en ${dias}d`, color: '#EF4444' };
  if (dias <= 30) return { texto: `Vence en ${dias}d`, color: '#F59E0B' };
  return { texto: `Vence en ${dias}d`, color: '#10B981' };
}

function fmtUsd(n: number) {
  return `US$ ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDop(n: number, decimals = 0) {
  return `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// ── Temas del Super Admin (independiente del ERP principal) ──────────────────

const SA_DARK = {
  bg:     '#0F172A',
  card:   '#1E293B',
  border: '#334155',
  txt:    '#F8FAFC',
  txt2:   '#94A3B8',
  gold:   '#F59E0B',
  green:  '#10B981',
  red:    '#EF4444',
  blue:   '#3B82F6',
  purple: '#8B5CF6',
};

const SA_LIGHT = {
  bg:     '#F1F5F9',
  card:   '#FFFFFF',
  border: '#E2E8F0',
  txt:    '#0F172A',
  txt2:   '#64748B',
  gold:   '#F59E0B',
  green:  '#059669',
  red:    '#DC2626',
  blue:   '#2563EB',
  purple: '#7C3AED',
};

type SaTheme = typeof SA_DARK;

const SaThemeCtx = createContext<SaTheme>(SA_DARK);
const useSaTheme = () => useContext(SaThemeCtx);

// Alias C para compatibilidad con sub-componentes (resuelto via context)
// Los sub-componentes que son funciones independientes usan useSaTheme()

const STORAGE_KEY = 'superadmin-theme';

// Solo los 4 planes activos — los legados (trial, basico, etc.) no se ofrecen en la UI
const PLANES = [
  { value: 'emprendedor', label: 'Emprendedor',   color: '#3B82F6', mrr: 0, mrrUsd: 29  },
  { value: 'pyme',        label: 'Pyme',          color: '#059669', mrr: 0, mrrUsd: 59  },
  { value: 'pro',         label: 'Pro',           color: '#0d9488', mrr: 0, mrrUsd: 89  },
  { value: 'plus',        label: 'Plus',          color: '#7C3AED', mrr: 0, mrrUsd: 129 },
  // Legado — solo para lookup de color/precio, no se muestran en selectores
  { value: 'trial',       label: 'Trial',         color: '#64748B', mrr: 0, mrrUsd: 0   },
  { value: 'enterprise',  label: 'Enterprise',    color: '#EF4444', mrr: 0, mrrUsd: 0   },
  { value: 'basico',      label: 'Básico',        color: '#6B7280', mrr: 0, mrrUsd: 0   },
  { value: 'profesional', label: 'Profesional',   color: '#6B7280', mrr: 0, mrrUsd: 0   },
  { value: 'empresarial', label: 'Empresarial',   color: '#6B7280', mrr: 0, mrrUsd: 0   },
];

// Solo los 4 planes activos para selectores de la UI
const PLANES_ACTIVOS = PLANES.filter(p => p.mrrUsd > 0);

const PLAN_COLOR: Record<string, string> = Object.fromEntries(PLANES.map(p => [p.value, p.color]));
const PLAN_MRR:   Record<string, number> = Object.fromEntries(PLANES.map(p => [p.value, p.mrr]));
const PLAN_MRR_USD: Record<string, number> = Object.fromEntries(PLANES.map(p => [p.value, p.mrrUsd]));

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, subColor, accent }:
  { icon: React.ReactNode; label: string; value: string | number; sub?: string; subColor?: string; accent: string }) {
  const C = useSaTheme();
  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: '20px 22px',
      border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8,
      borderTop: `3px solid ${accent}`,
      transition: 'all 300ms ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: C.txt2, fontSize: 13 }}>{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: C.txt, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: subColor ?? C.txt2 }}>{sub}</div>}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const color = PLAN_COLOR[plan] ?? '#64748B';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}55`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>{plan ?? 'sin plan'}</span>
  );
}

function EstadoBadge({ activa }: { activa: boolean }) {
  const C = useSaTheme();
  return (
    <span style={{
      background: activa ? `${C.green}22` : `${C.red}22`,
      color: activa ? C.green : C.red,
      border: `1px solid ${activa ? C.green : C.red}55`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>{activa ? '● Activa' : '● Suspendida'}</span>
  );
}

function LiveClock() {
  const C = useSaTheme();
  const [hora, setHora] = useState(() => new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const t = setInterval(() => setHora(new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ color: C.txt2, fontFamily: 'monospace', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
      <ClockIcon size={13} />{hora}
    </span>
  );
}

// ── Tab Solicitudes de activación ────────────────────────────────────────────

function SolicitudesTab({ C, solicitudes, isLoading, onRefresh }:
  { C: typeof SA_DARK; solicitudes: any[]; isLoading: boolean; onRefresh: () => void }) {
  const [drawerSolicitud, setDrawerSolicitud] = useState<any>(null);
  const [notaInterna, setNotaInterna] = useState('');
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const qc = useQueryClient();

  const aprobarMut = useMutation({
    mutationFn: ({ id, nota }: { id: number; nota?: string }) =>
      api.post(`/suscripciones/admin/solicitudes/${id}/aprobar`, { notaInterna: nota }),
    onSuccess: () => {
      message.success('Plan activado y solicitud aprobada');
      setDrawerSolicitud(null);
      qc.invalidateQueries({ queryKey: ['sa-solicitudes'] });
      qc.invalidateQueries({ queryKey: ['sa-suscripciones'] });
      onRefresh();
    },
    onError: (e: any) => {
      const data = e?.response?.data;
      const detail = data?.message ?? data?.errors?.[0] ?? data?.error ?? e?.message ?? 'Sin detalle';
      const status = e?.response?.status ?? 'red';
      message.error(`Error al aprobar (${status}): ${detail}`, 8);
      console.error('[aprobar solicitud] error completo:', JSON.stringify(data));
    },
  });

  const rechazarMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post(`/suscripciones/admin/solicitudes/${id}/rechazar`, { motivoRechazo: motivo }),
    onSuccess: () => {
      message.success('Solicitud rechazada');
      setDrawerSolicitud(null);
      onRefresh();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al rechazar'),
  });

  const ESTADO_COLOR: Record<string, string> = {
    pendiente: '#F59E0B', aprobada: '#10B981', rechazada: '#EF4444',
  };

  const columns = [
    { title: 'Empresa', dataIndex: ['empresa', 'nombre'], key: 'empresa', render: (v: string, r: any) => (
      <div>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>{v ?? `Empresa #${r.empresaId}`}</div>
        <div style={{ color: C.txt2, fontSize: 11 }}>{r.empresa?.rnc ?? '—'}</div>
      </div>
    )},
    { title: 'Plan solicitado', dataIndex: 'planSolicitado', key: 'plan', render: (v: string) => <PlanBadge plan={v} /> },
    { title: 'Modalidad', dataIndex: 'modalidad', key: 'modalidad', render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{v}</span> },
    { title: 'Fecha', dataIndex: 'createdAt', key: 'fecha', render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{fmtFecha(v)}</span> },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', render: (v: string) => (
      <span style={{ background: `${ESTADO_COLOR[v] ?? C.border}22`, color: ESTADO_COLOR[v] ?? C.txt2, border: `1px solid ${ESTADO_COLOR[v] ?? C.border}55`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>{v}</span>
    )},
    { title: '', key: 'actions', render: (_: any, r: any) => r.estado === 'pendiente' && (
      <Button size="small" onClick={() => { setDrawerSolicitud(r); setNotaInterna(''); setMotivoRechazo(''); }}
        style={{ background: C.gold, border: 'none', color: '#0F172A', fontWeight: 700 }}>
        Gestionar
      </Button>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ color: C.txt, margin: 0, fontWeight: 700 }}>
          Solicitudes de activación
          {solicitudes.filter(s => s.estado === 'pendiente').length > 0 && (
            <span style={{ marginLeft: 10, background: C.gold, color: '#0F172A', borderRadius: 10, padding: '1px 10px', fontSize: 12, fontWeight: 800 }}>
              {solicitudes.filter(s => s.estado === 'pendiente').length} pendientes
            </span>
          )}
        </h3>
        <Button size="small" onClick={onRefresh}>Actualizar</Button>
      </div>
      <Table
        loading={isLoading}
        dataSource={solicitudes}
        columns={columns}
        rowKey="id"
        size="small"
        style={{ fontSize: 13 }}
        pagination={{ pageSize: 20 }}
      />

      {/* Drawer de detalle / acciones */}
      <Modal
        open={!!drawerSolicitud}
        onCancel={() => setDrawerSolicitud(null)}
        footer={null}
        width={520}
        title={<span style={{ color: C.txt }}>Gestionar solicitud #{drawerSolicitud?.id}</span>}
        styles={{ content: { background: C.card, border: `1px solid ${C.border}` }, header: { background: C.card, borderBottom: `1px solid ${C.border}` } }}>
        {drawerSolicitud && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.txt2, fontSize: 12, marginBottom: 4 }}>Empresa</div>
              <div style={{ color: C.txt, fontWeight: 600 }}>{drawerSolicitud.empresa?.nombre ?? `Empresa #${drawerSolicitud.empresaId}`}</div>
              <div style={{ color: C.txt2, fontSize: 12 }}>RNC: {drawerSolicitud.empresa?.rnc ?? '—'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: C.bg, borderRadius: 8, padding: '12px', border: `1px solid ${C.border}` }}>
                <div style={{ color: C.txt2, fontSize: 11 }}>Plan solicitado</div>
                <div style={{ color: C.txt, fontWeight: 700 }}>{drawerSolicitud.planSolicitado?.toUpperCase()}</div>
              </div>
              <div style={{ background: C.bg, borderRadius: 8, padding: '12px', border: `1px solid ${C.border}` }}>
                <div style={{ color: C.txt2, fontSize: 11 }}>Modalidad</div>
                <div style={{ color: C.txt, fontWeight: 700 }}>{drawerSolicitud.modalidad}</div>
              </div>
            </div>
            {drawerSolicitud.comentario && (
              <div style={{ marginBottom: 16, background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
                <div style={{ color: C.txt2, fontSize: 11, marginBottom: 4 }}>Comentario del cliente</div>
                <div style={{ color: C.txt, fontSize: 13 }}>{drawerSolicitud.comentario}</div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.txt2, fontSize: 12, marginBottom: 6 }}>Nota interna (opcional)</div>
              <Input.TextArea
                value={notaInterna}
                onChange={e => setNotaInterna(e.target.value)}
                placeholder="Ej: Pago recibido por transferencia..."
                rows={2}
                style={{ background: C.bg, color: C.txt, borderColor: C.border }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Button
                type="primary" block
                loading={aprobarMut.isPending}
                onClick={() => aprobarMut.mutate({ id: drawerSolicitud.id, nota: notaInterna })}
                style={{ background: C.green, border: 'none', fontWeight: 700 }}>
                Aprobar y activar plan
              </Button>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ color: C.txt2, fontSize: 12, marginBottom: 6 }}>Motivo de rechazo</div>
              <Input
                value={motivoRechazo}
                onChange={e => setMotivoRechazo(e.target.value)}
                placeholder="Ej: Pago no confirmado..."
                style={{ background: C.bg, color: C.txt, borderColor: C.border }}
              />
            </div>
            <Button
              danger block
              loading={rechazarMut.isPending}
              disabled={!motivoRechazo.trim()}
              onClick={() => rechazarMut.mutate({ id: drawerSolicitud.id, motivo: motivoRechazo })}>
              Rechazar solicitud
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Tab Empresas en Prueba ────────────────────────────────────────────────────

function PruebasTab({ C, pruebas, isLoading, onRefresh }:
  { C: typeof SA_DARK; pruebas: any[]; isLoading: boolean; onRefresh: () => void }) {
  const qc = useQueryClient();
  const [extModal, setExtModal] = useState<any>(null);
  const [diasExt, setDiasExt] = useState(7);

  const extenderMut = useMutation({
    mutationFn: ({ id, dias }: { id: number; dias: number }) =>
      api.patch(`/suscripciones/admin/${id}/extender-prueba`, { dias }),
    onSuccess: () => {
      message.success('Prueba extendida');
      setExtModal(null);
      qc.invalidateQueries({ queryKey: ['sa-pruebas'] });
      onRefresh();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al extender'),
  });

  const activarDirectoMut = useMutation({
    mutationFn: ({ id, plan }: { id: number; plan: string }) =>
      api.patch(`/suscripciones/admin/${id}/activar`, { plan, meses: 1 }),
    onSuccess: () => {
      message.success('Plan activado');
      qc.invalidateQueries({ queryKey: ['sa-pruebas'] });
      qc.invalidateQueries({ queryKey: ['sa-suscripciones'] });
      onRefresh();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al activar'),
  });

  const columns = [
    { title: 'Empresa', key: 'empresa', render: (_: any, r: any) => (
      <div>
        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>{r.empresa?.nombre ?? `Empresa #${r.empresaId}`}</div>
        <div style={{ color: C.txt2, fontSize: 11 }}>{r.empresa?.rnc ?? '—'}</div>
      </div>
    )},
    { title: 'Plan', dataIndex: 'plan', key: 'plan', render: (v: string) => <PlanBadge plan={v} /> },
    { title: 'Vence', dataIndex: 'fechaFinPrueba', key: 'fin', render: (v: string) => {
      const { texto, color } = fmtRelativa(v);
      return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{texto}</span>;
    }},
    { title: 'Días restantes', dataIndex: 'diasRestantes', key: 'dias', render: (v: number) => (
      <div style={{ minWidth: 100 }}>
        <div style={{ background: C.border, borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, (v / 15) * 100))}%`, background: v <= 3 ? '#EF4444' : v <= 7 ? '#F59E0B' : '#10B981', borderRadius: 4 }} />
        </div>
        <div style={{ color: C.txt2, fontSize: 11, marginTop: 2 }}>{v} días restantes</div>
      </div>
    )},
    { title: '', key: 'actions', render: (_: any, r: any) => (
      <Space>
        <Button size="small" onClick={() => { setExtModal(r); setDiasExt(7); }}
          style={{ background: C.gold, border: 'none', color: '#0F172A', fontSize: 11 }}>
          Extender
        </Button>
        <Popconfirm
          title={`Activar plan ${r.plan} para ${r.empresa?.nombre ?? `empresa #${r.empresaId}`}?`}
          onConfirm={() => activarDirectoMut.mutate({ id: r.empresaId, plan: r.plan })}>
          <Button size="small" type="primary" style={{ fontSize: 11 }}>Activar ya</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ color: C.txt, margin: 0, fontWeight: 700 }}>Empresas en período de prueba ({pruebas.length})</h3>
        <Button size="small" onClick={onRefresh}>Actualizar</Button>
      </div>
      <Table
        loading={isLoading}
        dataSource={pruebas}
        columns={columns}
        rowKey="empresaId"
        size="small"
        pagination={{ pageSize: 20 }}
        style={{ fontSize: 13 }}
      />
      <Modal
        open={!!extModal}
        onCancel={() => setExtModal(null)}
        title={<span style={{ color: C.txt }}>Extender prueba — {extModal?.empresa?.nombre}</span>}
        onOk={() => extenderMut.mutate({ id: extModal.empresaId, dias: diasExt })}
        confirmLoading={extenderMut.isPending}
        styles={{ content: { background: C.card }, header: { background: C.card, borderBottom: `1px solid ${C.border}` } }}>
        <div style={{ padding: '8px 0' }}>
          <div style={{ color: C.txt2, marginBottom: 12 }}>¿Cuántos días extender la prueba?</div>
          <InputNumber min={1} max={90} value={diasExt} onChange={v => setDiasExt(v ?? 7)} style={{ width: '100%' }} />
        </div>
      </Modal>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

// ── Tab e-CF Config (Super Admin) ────────────────────────────────────────────
function EcfConfigTab({
  C,
  targetEmpresaId,
  onClearTarget,
}: {
  C: typeof SA_DARK;
  targetEmpresaId?: number | null;
  onClearTarget?: () => void;
}) {
  const qc = useQueryClient();
  const [formModal,     setFormModal]     = useState<any>(null);
  const [seqModal,      setSeqModal]      = useState<number | null>(null);
  const [testingId,     setTestingId]     = useState<number | null>(null);
  const [checkingId,    setCheckingId]    = useState<number | null>(null); // pre-check en curso
  const [form]    = Form.useForm();
  const [seqForm] = Form.useForm();

  /** Abre el modal en modo correcto (edición o creación) según si ya existe config */
  const abrirModalParaEmpresa = useCallback(async (empresaId: number) => {
    setCheckingId(empresaId);
    try {
      const existing = await ecfConfigApi.obtener(empresaId).catch(() => null);
      if (existing) {
        // Ya existe → modo EDICIÓN
        form.setFieldsValue({ ...existing, msellerPassword: '', msellerApiKey: '' });
        setFormModal(existing);
      } else {
        // No existe → modo CREACIÓN con empresaId pre-llenado
        form.resetFields();
        form.setFieldsValue({ empresaId });
        setFormModal({});
      }
    } catch {
      form.resetFields();
      form.setFieldsValue({ empresaId });
      setFormModal({});
    } finally {
      setCheckingId(null);
    }
  }, [form]);

  // Cuando el padre pide abrir para una empresa concreta
  useEffect(() => {
    if (targetEmpresaId) {
      abrirModalParaEmpresa(targetEmpresaId);
      onClearTarget?.();
    }
  }, [targetEmpresaId]);

  /** Handler para cuando el usuario escribe el empresaId manualmente (modo nueva config) */
  const handleEmpresaIdBlur = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
    const id = Number(e.target.value);
    if (!id || formModal?.id) return; // skip si ya estamos editando
    setCheckingId(id);
    try {
      const existing = await ecfConfigApi.obtener(id).catch(() => null);
      if (existing) {
        message.info(`La empresa #${id} ya tiene configuración. Abriendo en modo edición.`);
        form.setFieldsValue({ ...existing, msellerPassword: '', msellerApiKey: '' });
        setFormModal(existing);
      }
    } finally {
      setCheckingId(null);
    }
  }, [form, formModal]);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['ecf-configs'],
    queryFn:  ecfConfigApi.listar,
    staleTime: 30_000,
  });
  const { data: dash } = useQuery({
    queryKey: ['ecf-dash'],
    queryFn:  ecfConfigApi.dashboard,
    staleTime: 60_000,
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ['ecf-tipos'],
    queryFn:  () => import('../../api/client').then(m => m.default.get('/ecf/tipos').then((r: any) => r.data?.data ?? r.data ?? [])),
    staleTime: 10 * 60_000,
  });

  const crearMut = useMutation({
    mutationFn: (dto: any) => formModal?.id ? ecfConfigApi.actualizar(formModal.empresaId, dto) : ecfConfigApi.crear(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ecf-configs'] }); setFormModal(null); form.resetFields(); message.success('Configuración guardada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al guardar'),
  });

  const eliminarEcfMut = useMutation({
    mutationFn: (empresaId: number) => ecfConfigApi.eliminar(empresaId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ecf-configs'] }); message.success('Configuración e-CF eliminada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? (e as any)?.response?.data?.errors?.[0] ?? 'Error al eliminar'),
  });

  const seqMut = useMutation({
    mutationFn: (dto: any) => ecfConfigApi.crearSeq({ ...dto, empresaId: seqModal }),
    onSuccess: () => { setSeqModal(null); seqForm.resetFields(); message.success('Secuencia cargada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al cargar secuencia'),
  });

  const testConexion = async (empresaId: number) => {
    setTestingId(empresaId);
    try {
      const r = await ecfConfigApi.testConexion(empresaId) as any;
      message.success(`✅ ${r.mensaje}`);
    } catch (e: any) {
      const msg = (e as any)?.friendlyMessage
        ?? (e as any)?.response?.data?.message
        ?? (e as any)?.response?.data?.errors?.[0]
        ?? 'Conexión fallida';
      const esBloqueada = msg.toLowerCase().includes('bloqueada') || msg.toLowerCase().includes('bloquead');
      if (esBloqueada) {
        message.warning(msg, 6);
      } else {
        message.error(msg, 6);
      }
    } finally {
      setTestingId(null);
    }
  };

  // Calcular estado e-CF de cada empresa
  const getEstadoEcf = (cfg: any) => {
    if (!cfg) return 'sin_config';
    if (!cfg.activo) return 'inactivo';
    return 'activo';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Dashboard rápido */}
      {dash && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'e-CFs hoy',          value: dash.totalHoy,              color: C.blue },
            { label: 'e-CFs este mes',      value: dash.totalMes,              color: C.blue },
            { label: '% Aceptados',         value: `${dash.pctAceptados}%`,    color: C.green },
            { label: 'Empresas con e-CF',   value: dash.empresasConfiguradas,  color: C.gold },
          ].map(k => (
            <div key={k.label} style={{ background: C.card, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}`, borderTop: `3px solid ${k.color}` }}>
              <div style={{ color: C.txt2, fontSize: 12, marginBottom: 6 }}>{k.label}</div>
              <div style={{ color: C.txt, fontWeight: 800, fontSize: 24 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de configuraciones */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: 0 }}>Configuraciones e-CF por Empresa</h3>
          <Button type="primary" size="small" loading={!!checkingId}
            onClick={() => { form.resetFields(); setFormModal({}); }}>
            + Nueva config
          </Button>
        </div>

        {isLoading ? <Spin /> : (configs as any[]).length === 0 ? (
          <Alert message="No hay empresas con configuración e-CF. Agrega la primera." type="info" showIcon />
        ) : (
          <Table
            dataSource={configs as any[]}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: 'Empresa', dataIndex: 'empresaId', render: (v: number, r: any) => (
                <div>
                  <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>#{v}</div>
                  <div style={{ color: C.txt2, fontSize: 11 }}>{r.rncEmisor}</div>
                </div>
              )},
              { title: 'Email e-CF', dataIndex: 'msellerEmail', render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{v}</span> },
              { title: 'Modo', dataIndex: 'modo', render: (v: string) => (
                <Tag color={v === 'PRODUCCION' ? 'green' : v === 'CERTIFICACION' ? 'blue' : 'orange'}>{v}</Tag>
              )},
              { title: 'Estado', key: 'estado', render: (_: any, r: any) => (
                <span style={{
                  color: r.activo ? C.green : C.red,
                  fontWeight: 600, fontSize: 12,
                }}>
                  {r.activo ? '● Activo' : '● Inactivo'}
                </span>
              )},
              { title: 'Acciones', key: 'acc', render: (_: any, r: any) => {
                const bloqueadaHasta = r.bloqueadoHasta ? new Date(r.bloqueadoHasta) : null;
                const estaBloqueada  = bloqueadaHasta ? bloqueadaHasta > new Date() : false;
                const minRestantes   = estaBloqueada && bloqueadaHasta
                  ? Math.max(1, Math.ceil((bloqueadaHasta.getTime() - Date.now()) / 60_000))
                  : 0;
                return (
                <Space size={4}>
                  <Button size="small" onClick={() => { form.setFieldsValue({ ...r, msellerPassword: '', msellerApiKey: '' }); setFormModal(r); }}>
                    Editar
                  </Button>
                  {estaBloqueada ? (
                    <Tooltip title={`Cuenta bloqueada por Cognito — espera ~${minRestantes} min`}>
                      <Button size="small" disabled>🔒 Bloqueado</Button>
                    </Tooltip>
                  ) : (
                    <Button size="small" loading={testingId === r.empresaId} onClick={() => testConexion(r.empresaId)}>
                      Test
                    </Button>
                  )}
                  <Button size="small" onClick={() => setSeqModal(r.empresaId)}>
                    Secuencias
                  </Button>
                  <Popconfirm
                    title="¿Eliminar configuración e-CF?"
                    description={`Se eliminará la configuración de la Empresa #${r.empresaId}. Esta acción no se puede deshacer.`}
                    okText="Eliminar" okType="danger" cancelText="Cancelar"
                    onConfirm={() => eliminarEcfMut.mutate(r.empresaId)}
                  >
                    <Button size="small" danger loading={eliminarEcfMut.isPending}>
                      Eliminar
                    </Button>
                  </Popconfirm>
                </Space>
                );
              }},
            ]}
          />
        )}
      </div>

      {/* Modal crear/editar config */}
      <Modal
        open={!!formModal}
        title={
          checkingId ? 'Verificando configuración...' :
          formModal?.id ? `✏️ Editar e-CF — Empresa #${formModal.empresaId}` : '➕ Nueva configuración e-CF'
        }
        onCancel={() => { setFormModal(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => crearMut.mutate(v))}
        confirmLoading={crearMut.isPending}
        okText="Guardar"
        width={560}
        centered
      >
        <Form form={form} layout="vertical" style={{ paddingTop: 8 }}>
          {!formModal?.id && (
            <Form.Item
              name="empresaId"
              label="ID de la empresa"
              rules={[{ required: true }]}
              extra={checkingId ? 'Verificando si ya tiene configuración...' : 'Al salir del campo se verifica si ya existe una config'}
            >
              <InputNumber
                min={1}
                style={{ width: '100%' }}
                onBlur={handleEmpresaIdBlur as any}
              />
            </Form.Item>
          )}
          <Form.Item name="msellerEmail" label="Email e-CF" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="usuario@empresa.com" />
          </Form.Item>
          <Form.Item name="msellerPassword" label={formModal?.id ? 'Contraseña e-CF (dejar vacío para no cambiar)' : 'Contraseña e-CF'} rules={[{ required: !formModal?.id }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="msellerApiKey" label={formModal?.id ? 'API Key e-CF (dejar vacío para no cambiar)' : 'API Key e-CF'} rules={[{ required: !formModal?.id }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="modo" label="Modo" initialValue="TEST">
            <Select options={[{ value: 'TEST', label: 'TEST — Pruebas' }, { value: 'CERTIFICACION', label: 'CERTIFICACIÓN — DGII' }, { value: 'PRODUCCION', label: 'PRODUCCIÓN' }]} />
          </Form.Item>
          <Form.Item name="rncEmisor" label="RNC Emisor" rules={[{ required: true, pattern: /^\d{9}$|^\d{11}$/, message: 'RNC de 9 u 11 dígitos' }]}>
            <Input maxLength={11} />
          </Form.Item>
          <Form.Item name="razonSocialEmisor" label="Razón Social" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="direccionEmisor" label="Dirección">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal cargar secuencia NCF */}
      <Modal
        open={!!seqModal}
        title={`Cargar rango eNCF — Empresa #${seqModal}`}
        onCancel={() => { setSeqModal(null); seqForm.resetFields(); }}
        onOk={() => seqForm.validateFields().then(v => seqMut.mutate(v))}
        confirmLoading={seqMut.isPending}
        okText="Cargar rango"
        centered
        width={440}
      >
        <Form form={seqForm} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="tipoECFId" label="Tipo de e-CF" rules={[{ required: true }]}>
            <Select
              options={(tipos as any[]).map((t: any) => ({ value: t.id, label: `${t.codigo} — ${t.descripcion}` }))}
              placeholder="Selecciona el tipo"
            />
          </Form.Item>
          <Form.Item name="secuenciaInicial" label="Número inicial" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="secuenciaFinal" label="Número final" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fechaVencimiento" label="Fecha de vencimiento (DGII)" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Editor de Planes y Precios ─────────────────────────────────────────────────
function PlanesEditor({ C }: { C: typeof SA_DARK }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<any>(null);
  const [form] = Form.useForm();

  const { data: planes, isLoading } = useQuery({
    queryKey: ['sa-planes'],
    queryFn:  () => api.get('/admin/planes').then(xd),
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: ({ clave, ...dto }: any) => api.patch(`/admin/planes/${clave}`, dto),
    onSuccess: () => {
      // Invalida el catálogo de planes en toda la app
      qc.invalidateQueries({ queryKey: ['sa-planes'] });
      qc.invalidateQueries({ queryKey: ['planes-catalogo'] });
      setEditando(null);
      form.resetFields();
      message.success('Plan actualizado — se reflejará en toda la app');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const PLAN_COLORS: Record<string, string> = {
    emprendedor: '#3B82F6', pyme: '#059669', pro: '#0d9488', plus: '#4F46E5',
    trial: '#64748B', basico: '#6B7280', profesional: '#6B7280', empresarial: '#6B7280', enterprise: '#EF4444',
  };

  // Usar precioMensualUsd del nuevo getPlanesCatalogo()
  const getPrecioUsd = (p: any): number =>
    p.precioMensualUsd ?? p.precio ?? 0;

  return (
    <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Crown size={16} style={{ color: C.gold }} /> Planes y Precios
      </h3>
      <p style={{ color: C.txt2, fontSize: 12, margin: '0 0 16px' }}>
        Los cambios se propagan automáticamente a toda la app.
      </p>

      {isLoading ? <Spin size="small" /> : (planes ?? []).map((p: any) => {
        const precioUsd = getPrecioUsd(p);
        return (
          <div key={p.clave} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: PLAN_COLORS[p.clave] ?? '#94A3B8', flexShrink: 0 }} />
              <span style={{ color: C.txt, fontWeight: 600 }}>{p.nombre?.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: precioUsd > 0 ? C.gold : C.txt2, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {precioUsd > 0 ? `US$${precioUsd}/mes` : 'N/A'}
              </span>
              <Button
                size="small"
                icon={<Edit2 size={12} />}
                onClick={() => {
                  setEditando(p);
                  form.setFieldsValue({ nombre: p.nombre, precio: precioUsd });
                }}
                style={{ color: C.txt2, background: 'transparent', border: `1px solid ${C.border}` }}
              >
                Editar
              </Button>
            </div>
          </div>
        );
      })}

      {/* Modal editar plan */}
      <Modal
        open={!!editando}
        title={<span style={{ color: C.txt }}>Editar Plan: {editando?.nombre}</span>}
        onCancel={() => { setEditando(null); form.resetFields(); }}
        onOk={() => form.validateFields().then(v => updateMut.mutate({ clave: editando.clave, ...v }))}
        confirmLoading={updateMut.isPending}
        okText="Guardar cambios"
        okButtonProps={{ style: { background: C.gold, borderColor: C.gold } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="nombre" label="Nombre del plan" rules={[{ required: true }]}>
            <Input placeholder="ej. Emprendedor" />
          </Form.Item>
          <Form.Item name="precio" label="Precio mensual (US$)">
            <InputNumber
              style={{ width: '100%' }}
              min={0} precision={2}
              placeholder="29"
            />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción corta (opcional)">
            <Input placeholder="Descripción breve del plan..." />
          </Form.Item>
          <Alert
            type="info" showIcon
            message="Nota: los precios en USD y límites de ingresos están definidos en el código del backend. Aquí solo puedes editar el nombre y descripción visibles."
            style={{ fontSize: 12 }}
          />
        </Form>
      </Modal>
    </div>
  );
}

// ── Configuración Global de Seguridad ─────────────────────────────────────────

function SeguridadGlobalEditor({ C }: { C: typeof SA_DARK }) {
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, number>>({});

  const { data: configs = [] as any[], isLoading } = useQuery<any[]>({
    queryKey: ['sa-config-global'],
    queryFn:  () => api.get('/admin/configuracion-global').then(xd),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (configs.length > 0) {
      const map: Record<string, number> = {};
      (configs as any[]).forEach((c: any) => { map[c.clave] = Number(c.valor); });
      setValores(map);
    }
  }, [configs]);

  const updateMut = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: number }) =>
      api.patch(`/admin/configuracion-global/${clave}`, { valor: String(valor) }),
    onSuccess: (_, { clave, valor }) => {
      qc.invalidateQueries({ queryKey: ['sa-config-global'] });
      message.success(`${clave} actualizado a ${valor}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar'),
  });

  const CAMPOS = [
    {
      clave: 'SESION_HORAS',
      label: 'Duración de sesión (horas)',
      desc:  'Tiempo antes de que expire la sesión de los usuarios. Las empresas pueden sobreescribir este valor en Configuración → Seguridad.',
      min: 1, max: 720, step: 1,
    },
    {
      clave: 'MAX_INTENTOS_LOGIN',
      label: 'Intentos de login antes de bloquear',
      desc:  'Número de intentos fallidos permitidos antes de bloquear la cuenta temporalmente. Las empresas pueden sobreescribir este valor.',
      min: 3, max: 10, step: 1,
    },
  ];

  return (
    <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, gridColumn: '1 / -1' }}>
      <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Shield size={16} style={{ color: C.blue }} /> Seguridad Global — Topes Máximos
      </h3>
      <p style={{ color: C.txt2, fontSize: 12, margin: '0 0 18px' }}>
        Estos son los valores <strong>máximos permitidos</strong> para todas las empresas. Las empresas pueden ser más estrictas (sesión más corta, menos intentos), pero <strong>nunca más laxas</strong> que estos topes.
      </p>
      {isLoading
        ? <Spin size="small" />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {CAMPOS.map(campo => (
              <div key={campo.clave} style={{ background: C.card, borderRadius: 10, padding: '16px 18px', border: `1px solid ${C.border}` }}>
                <div style={{ color: C.txt, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{campo.label}</div>
                <div style={{ color: C.txt2, fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>{campo.desc}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <InputNumber
                    min={campo.min}
                    max={campo.max}
                    step={campo.step}
                    value={valores[campo.clave]}
                    onChange={v => setValores(prev => ({ ...prev, [campo.clave]: v ?? campo.min }))}
                    style={{ width: 100 }}
                    addonAfter={campo.clave === 'SESION_HORAS' ? 'h' : undefined}
                  />
                  <Button
                    type="primary"
                    size="small"
                    loading={updateMut.isPending && (updateMut.variables as any)?.clave === campo.clave}
                    onClick={() => updateMut.mutate({ clave: campo.clave, valor: valores[campo.clave] ?? campo.min })}
                  >
                    Guardar
                  </Button>
                  <span style={{ color: C.txt2, fontSize: 11 }}>
                    ({campo.min}–{campo.max})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Módulos Add-on por empresa (panel dentro del modal de detalle) ─────────────

const MODULO_ICONS: Record<string, string> = { optica: '👓', hotel: '🏨', clinica: '🏥' };

function ModulosEmpresaPanel({ empresaId }: { empresaId: number }) {
  const C = useSaTheme();
  const { data: disponibles = [], isLoading: loadDis } = useQuery({
    queryKey: ['sa-modulos-disponibles'],
    queryFn:  () => api.get('/admin/modulos').then(xd),
    staleTime: 5 * 60_000,
  });
  const { data: modulosEmpresa = [], isLoading: loadEmp, refetch } = useQuery({
    queryKey: ['sa-modulos-empresa', empresaId],
    queryFn:  () => api.get(`/admin/empresas/${empresaId}/modulos`).then(xd),
    enabled:  !!empresaId,
    staleTime: 10_000,
  });
  const toggleMut = useMutation({
    mutationFn: ({ codigo, activo }: { codigo: string; activo: boolean }) =>
      activo
        ? api.post(`/admin/empresas/${empresaId}/modulos/activar`,    { codigo })
        : api.post(`/admin/empresas/${empresaId}/modulos/desactivar`, { codigo }),
    onSuccess: () => { refetch(); message.success('Módulo actualizado'); },
    onError:   (e: any) => message.error(e?.response?.data?.message ?? 'Error al actualizar módulo'),
  });

  if (loadDis || loadEmp) return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>;
  if ((disponibles as any[]).length === 0) {
    return <Empty description={<span style={{ color: C.txt2 }}>No hay módulos disponibles</span>} />;
  }

  return (
    <div>
      {(disponibles as any[]).map((modulo: any) => {
        const activacion = (modulosEmpresa as any[]).find((m: any) => m.moduloCodigo === modulo.codigo);
        const activo     = activacion?.activo ?? false;
        const icon       = MODULO_ICONS[modulo.codigo] ?? '🧩';
        return (
          <div key={modulo.codigo} style={{
            background: C.bg, borderRadius: 10, padding: '14px 18px', marginBottom: 10,
            border: `1px solid ${activo ? C.green + '66' : C.border}`,
            borderLeft: `4px solid ${activo ? C.green : C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 26, flexShrink: 0, lineHeight: 1.2 }}>{icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.txt, fontWeight: 700, fontSize: 14 }}>{modulo.nombre}</div>
                  <div style={{ color: C.txt2, fontSize: 12, marginTop: 2 }}>{modulo.descripcion}</div>
                  {activacion?.fechaActivacion && (
                    <div style={{ color: C.txt2, fontSize: 11, marginTop: 4 }}>
                      Activado: {fmtFecha(activacion.fechaActivacion)}
                      {activacion.fechaVencimiento && ` · Vence: ${fmtFecha(activacion.fechaVencimiento)}`}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{
                  background: activo ? `${C.green}22` : C.border,
                  color: activo ? C.green : C.txt2,
                  border: `1px solid ${activo ? `${C.green}55` : C.border}`,
                  borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  {activo ? '● Activo' : '○ Inactivo'}
                </span>
                <Button
                  size="small"
                  type={activo ? 'default' : 'primary'}
                  danger={activo}
                  loading={toggleMut.isPending}
                  onClick={() => toggleMut.mutate({ codigo: modulo.codigo, activo: !activo })}
                  style={!activo ? { background: C.green, borderColor: C.green, color: '#fff' } : undefined}
                >
                  {activo ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab global Módulos Add-on ─────────────────────────────────────────────────

function ModulosAddonTab() {
  const C = useSaTheme();
  const [filtroModulo, setFiltroModulo] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['sa-modulos-global'],
    queryFn:  () => api.get('/admin/modulos/activaciones').then(xd),
    staleTime: 30_000,
  });

  const resumen      = (data as any)?.resumen      ?? [];
  const activaciones = (data as any)?.activaciones ?? [];

  const filtradas = filtroModulo
    ? (activaciones as any[]).filter((a: any) => a.moduloCodigo === filtroModulo)
    : activaciones;

  return (
    <div>
      {/* Tarjetas resumen por módulo */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        {(resumen as any[]).map((m: any) => (
          <div key={m.codigo}
            onClick={() => setFiltroModulo(filtroModulo === m.codigo ? undefined : m.codigo)}
            style={{
              background: C.card, borderRadius: 10, padding: '16px 20px', minWidth: 180,
              border: `1px solid ${filtroModulo === m.codigo ? C.gold : C.border}`,
              borderTop: `3px solid ${m.empresasActivas > 0 ? C.green : C.border}`,
              cursor: 'pointer', opacity: filtroModulo && filtroModulo !== m.codigo ? 0.5 : 1,
              transition: 'all .15s',
            }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>{MODULO_ICONS[m.codigo] ?? '🧩'}</div>
            <div style={{ color: C.txt, fontWeight: 700, fontSize: 14 }}>{m.nombre}</div>
            <div style={{ color: m.empresasActivas > 0 ? C.green : C.txt2, fontSize: 26, fontWeight: 800, margin: '4px 0' }}>
              {m.empresasActivas}
            </div>
            <div style={{ color: C.txt2, fontSize: 12 }}>empresas activas</div>
          </div>
        ))}
        {(resumen as any[]).length === 0 && !isLoading && (
          <div style={{ color: C.txt2, fontSize: 13 }}>No hay módulos add-on configurados.</div>
        )}
      </div>

      {/* Filtro activo */}
      {filtroModulo && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setFiltroModulo(undefined)}
            style={{ background: C.border, border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: C.txt2, fontSize: 12 }}>
            × Limpiar filtro
          </button>
          <span style={{ color: C.txt2, fontSize: 12 }}>
            Mostrando: {(resumen as any[]).find((m: any) => m.codigo === filtroModulo)?.nombre}
          </span>
        </div>
      )}

      {/* Tabla de activaciones */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <Table
          size="small"
          loading={isLoading}
          rowKey={(r: any) => `${r.empresaId}-${r.moduloCodigo}`}
          dataSource={filtradas as any[]}
          pagination={{ pageSize: 20, showTotal: t => `${t} activaciones` }}
          scroll={{ x: 780 }}
          locale={{ emptyText: <span style={{ color: C.txt2 }}>Ninguna empresa tiene módulos activos</span> }}
          columns={[
            {
              title: 'Empresa', key: 'empresa',
              render: (_: any, r: any) => (
                <span style={{ color: C.txt, fontWeight: 600 }}>{r.empresaNombre}</span>
              ),
            },
            {
              title: 'Módulo', key: 'modulo', width: 160,
              render: (_: any, r: any) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{MODULO_ICONS[r.moduloCodigo] ?? '🧩'}</span>
                  <span style={{ color: C.txt }}>{r.moduloNombre}</span>
                </span>
              ),
            },
            {
              title: 'F. Activación', dataIndex: 'fechaActivacion', width: 120,
              render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{fmtFecha(v)}</span>,
            },
            {
              title: 'Vencimiento', dataIndex: 'fechaVencimiento', width: 130,
              render: (v: string) => v
                ? <span style={{ color: C.txt2, fontSize: 12 }}>{fmtFecha(v)}</span>
                : <span style={{ color: C.txt2, fontSize: 12 }}>Sin vencimiento</span>,
            },
            {
              title: 'Activado por', dataIndex: 'activadoPorNombre', width: 150,
              render: (v: string) => <span style={{ color: C.txt2 }}>{v ?? '—'}</span>,
            },
            {
              title: 'Notas', dataIndex: 'notas', ellipsis: true,
              render: (v: string) => v ? <span style={{ color: C.txt2, fontSize: 12 }}>{v}</span> : null,
            },
          ]}
        />
      </div>
    </div>
  );
}

// ── DemosTab ──────────────────────────────────────────────────────────────────

function DemosTab({ C }: { C: SaTheme }) {
  const qc = useQueryClient();
  const [page,        setPage]        = useState(1);
  const [estado,      setEstado]      = useState('');
  const [search,      setSearch]      = useState('');
  const [detalle,     setDetalle]     = useState<any>(null);
  const [nuevaNota,   setNuevaNota]   = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-demos', page, estado, search],
    queryFn:  () => demoApi.listar(page, estado || undefined, search || undefined),
    staleTime: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['sa-demo-stats'],
    queryFn:  demoApi.estadisticas,
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => demoApi.actualizarEstado(id, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['sa-demos'] });
      qc.invalidateQueries({ queryKey: ['sa-demo-stats'] });
      setDetalle(updated);
      message.success('Solicitud actualizada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const addNota = async () => {
    if (!nuevaNota.trim() || !detalle) return;
    setGuardandoNota(true);
    try {
      const updated = await demoApi.agregarNota(detalle.id, nuevaNota.trim());
      setDetalle(updated);
      setNuevaNota('');
      qc.invalidateQueries({ queryKey: ['sa-demos'] });
      message.success('Nota guardada');
    } catch { message.error('Error al guardar nota'); }
    finally { setGuardandoNota(false); }
  };

  const ESTADOS = Object.entries(ESTADO_DEMO_LABEL).map(([k, v]) => ({ value: k, label: v }));

  // Métricas
  const total     = stats?.total      ?? 0;
  const nuevas    = stats?.nuevas     ?? 0;
  const agendadas = stats?.agendadas  ?? 0;
  const tasa      = stats?.tasaConversion ?? 0;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total solicitudes',      value: total,         color: C.blue,   sub: `${stats?.hoy ?? 0} hoy` },
          { label: 'Sin contactar',          value: nuevas,        color: C.red,    sub: nuevas > 0 ? '⚠ Requieren acción' : '✓ Al día' },
          { label: 'Demos agendadas',        value: agendadas,     color: C.gold,   sub: 'En proceso' },
          { label: 'Tasa conversión',        value: `${tasa}%`,    color: C.green,  sub: 'Nuevas → Convertidas' },
        ].map(k => (
          <div key={k.label} style={{
            background: C.card, borderRadius: 12, padding: '18px 20px',
            border: `1px solid ${C.border}`, borderTop: `3px solid ${k.color}`,
          }}>
            <div style={{ color: C.txt2, fontSize: 12, marginBottom: 6 }}>{k.label}</div>
            <div style={{ color: k.color, fontWeight: 800, fontSize: 28 }}>{k.value}</div>
            <div style={{ color: C.txt2, fontSize: 11, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Buscar por nombre, empresa o email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          allowClear
          style={{ width: 280, background: C.card, borderColor: C.border, color: C.txt }}
          prefix={<Search size={13} style={{ color: C.txt2 }} />}
        />
        <Select
          placeholder="Estado"
          allowClear
          value={estado || undefined}
          onChange={(v) => { setEstado(v ?? ''); setPage(1); }}
          style={{ width: 180 }}
          options={ESTADOS}
        />
        <span style={{ color: C.txt2, fontSize: 12, marginLeft: 'auto' }}>
          {data?.meta?.total ?? 0} solicitudes
        </span>
      </div>

      {/* Tabla */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <Table
          size="small"
          scroll={{ x: 900 }}
          loading={isLoading}
          rowKey="id"
          dataSource={data?.data ?? []}
          pagination={{
            current: page, pageSize: 20,
            total: data?.meta?.total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: t => `${t} solicitudes`,
            style: { padding: '8px 16px', borderTop: `1px solid ${C.border}` },
          }}
          onRow={r => ({ onClick: () => setDetalle(r), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Fecha',   dataIndex: 'createdAt', width: 100,
              render: (v: string) => new Date(v).toLocaleDateString('es-DO', { day:'2-digit', month:'2-digit', year:'numeric' }) },
            { title: 'Nombre',  dataIndex: 'nombre',  ellipsis: true },
            { title: 'Empresa', dataIndex: 'empresa', ellipsis: true },
            { title: 'Email',   dataIndex: 'email',   ellipsis: true },
            { title: 'Tel.',    dataIndex: 'telefono', width: 120 },
            { title: 'País',    dataIndex: 'pais',    width: 100 },
            { title: 'Estado',  dataIndex: 'estado',  width: 160,
              render: (v: string) => (
                <Tag color={ESTADO_DEMO_COLOR[v] ?? 'default'} style={{ fontSize: 11 }}>
                  {ESTADO_DEMO_LABEL[v] ?? v}
                </Tag>
              )},
            { title: 'Notas', key: 'notas', width: 60, align: 'center' as const,
              render: (_: any, r: any) => r.notas?.length > 0
                ? <span style={{ color: C.gold, fontSize: 12 }}>💬 {r.notas.length}</span>
                : null },
          ]}
        />
      </div>

      {/* Drawer de detalle */}
      <Modal
        open={!!detalle}
        onCancel={() => setDetalle(null)}
        footer={null}
        width={560}
        title={
          <span style={{ fontWeight: 700 }}>
            {detalle?.empresa} — {detalle?.nombre}
          </span>
        }
      >
        {detalle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Datos del prospecto */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Email',    detalle.email],
                ['Teléfono', detalle.telefono],
                ['País',     detalle.pais],
                ['Tamaño',   `${detalle.tamanoEmpresa} empleados`],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 11, color: C.txt2, marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{v}</div>
                </div>
              ))}
            </div>
            {detalle.modulosInteres?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.txt2, marginBottom: 6 }}>Módulos de interés</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {detalle.modulosInteres.map((m: string) => (
                    <Tag key={m} style={{ fontSize: 11 }}>{m}</Tag>
                  ))}
                </div>
              </div>
            )}
            {detalle.mensaje && (
              <div>
                <div style={{ fontSize: 11, color: C.txt2, marginBottom: 4 }}>Mensaje del prospecto</div>
                <div style={{ fontSize: 13, color: C.txt2, fontStyle: 'italic' }}>"{detalle.mensaje}"</div>
              </div>
            )}

            {/* Cambiar estado inline */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: C.txt2, fontWeight: 600, minWidth: 70 }}>Estado:</div>
              <Select
                value={detalle.estado}
                onChange={(v) => updateMut.mutate({ id: detalle.id, body: { estado: v } })}
                style={{ flex: 1 }}
                options={ESTADOS}
                loading={updateMut.isPending}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: C.txt2, fontWeight: 600, minWidth: 70 }}>Asignado:</div>
              <Input
                defaultValue={detalle.asignadoA ?? ''}
                placeholder="Nombre del ejecutivo..."
                onBlur={e => {
                  if (e.target.value !== (detalle.asignadoA ?? '')) {
                    updateMut.mutate({ id: detalle.id, body: { asignadoA: e.target.value } });
                  }
                }}
                style={{ flex: 1 }}
              />
            </div>

            {/* Historial de notas */}
            <div>
              <div style={{ fontSize: 12, color: C.txt2, fontWeight: 700, marginBottom: 8 }}>
                💬 Notas internas
              </div>
              {(detalle.notas ?? []).length === 0 && (
                <div style={{ color: C.txt2, fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>
                  Sin notas aún
                </div>
              )}
              {(detalle.notas ?? []).map((n: any, i: number) => (
                <div key={i} style={{
                  background: C.bg, borderRadius: 8, padding: '10px 14px',
                  marginBottom: 8, border: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>{n.autorNombre}</span>
                    <span style={{ fontSize: 11, color: C.txt2 }}>
                      {new Date(n.fecha).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.txt }}>{n.texto}</div>
                </div>
              ))}

              {/* Agregar nota */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Input.TextArea
                  placeholder="Agregar nota interna..."
                  value={nuevaNota}
                  onChange={e => setNuevaNota(e.target.value)}
                  rows={2}
                  style={{ flex: 1, resize: 'none' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNota();
                  }}
                />
                <Button
                  type="primary"
                  onClick={addNota}
                  loading={guardandoNota}
                  disabled={!nuevaNota.trim()}
                  style={{ alignSelf: 'flex-end' }}
                >
                  Guardar
                </Button>
              </div>
              <div style={{ fontSize: 10, color: C.txt2, marginTop: 4 }}>Ctrl+Enter para guardar rápido</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function SuperAdminPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Tema independiente del ERP ────────────────────────────────────────────
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? saved === 'dark' : false; // light por defecto (igual que el ERP principal)
  });

  const C = isDark ? SA_DARK : SA_LIGHT;

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  // Estado UI
  const [tab, setTab]               = useState('empresas');
  const [busqueda, setBusqueda]     = useState('');
  const [filtroPlan, setFiltroPlan] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [detalleEmpresa, setDetalleEmpresa] = useState<any>(null);
  const [modalPlan, setModalPlan]   = useState<any>(null);
  const [modalMsg, setModalMsg]     = useState<any>(null);
  const [modalVence, setModalVence] = useState<any>(null);
  const [venceFecha, setVenceFecha] = useState<any>(null);
  const [venceMotivo, setVenceMotivo] = useState('');
  const [planSel, setPlanSel]       = useState('profesional');
  const [meses, setMeses]           = useState(1);
  // ECF: empresaId que debe abrirse en la tab de e-CF Config
  const [ecfTargetId, setEcfTargetId] = useState<number | null>(null);
  const [formMsg]                   = Form.useForm();

  // ── Plan de Cuentas — sincronización ─────────────────────────────────────
  const [loadingSync, setLoadingSync] = useState(false);
  const [syncResult, setSyncResult]   = useState<{
    procesadas: number;
    cuentasAgregadas: number;
    errores: string[];
  } | null>(null);
  const [empresaIdFiltro, setEmpresaIdFiltro] = useState<number | undefined>();

  const handleSincronizarPlanCuentas = async () => {
    setLoadingSync(true);
    setSyncResult(null);
    try {
      const res = await api.post('/admin/contabilidad/plan-cuentas/sincronizar', {
        empresaId: empresaIdFiltro,
      });
      const data = res.data?.data ?? res.data;
      setSyncResult(data);
      message.success(`${data.cuentasAgregadas} cuentas agregadas en ${data.procesadas} empresa(s)`);
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Error al sincronizar el plan de cuentas');
    } finally {
      setLoadingSync(false);
    }
  };

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: metricas, isLoading: loadMet } = useQuery({
    queryKey: ['sa-metricas'],
    queryFn:  () => api.get('/admin/metricas').then(xd),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: empresas = [], isLoading: loadEmp } = useQuery({
    queryKey: ['sa-empresas'],
    queryFn:  () => api.get('/admin/empresas').then(xd),
    staleTime: 30_000,
  });

  const { data: usuarios = [], isLoading: loadUsu } = useQuery({
    queryKey: ['sa-usuarios'],
    queryFn:  () => api.get('/admin/usuarios').then(xd),
    staleTime: 30_000,
  });

  // ── Demo stats — para badge en sidebar ───────────────────────────────────
  const { data: demoStats } = useQuery({
    queryKey: ['sa-demo-stats-main'],
    queryFn:  demoApi.estadisticas,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const demosNuevas = demoStats?.nuevas ?? 0;

  // ── Registros pendientes de aprobación ────────────────────────────────────
  const { data: pendientes = [], isLoading: loadPendientes, refetch: refetchPendientes } = useQuery({
    queryKey: ['sa-pendientes'],
    queryFn:  () => api.get('/admin/registros-pendientes').then(xd),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const pendientesCount = (pendientes as any[]).length;

  const aprobarRegistroMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/registros-pendientes/${id}/aprobar`).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-pendientes'] });
      qc.invalidateQueries({ queryKey: ['sa-usuarios'] });
      message.success(res?.mensaje ?? 'Cuenta aprobada');
    },
    onError: () => message.error('Error al aprobar'),
  });

  const [rechazarModal, setRechazarModal] = useState<any>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const rechazarRegistroMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post(`/admin/registros-pendientes/${id}/rechazar`, { motivo }).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-pendientes'] });
      qc.invalidateQueries({ queryKey: ['sa-usuarios'] });
      setRechazarModal(null);
      setMotivoRechazo('');
      message.success(res?.mensaje ?? 'Solicitud rechazada');
    },
    onError: () => message.error('Error al rechazar'),
  });

  // ── Empresas pendientes de aprobación ────────────────────────────────────
  const { data: empresasPend = [], isLoading: loadEmpPend, refetch: refetchEmpPend } = useQuery({
    queryKey: ['sa-empresas-pendientes'],
    queryFn:  () => api.get('/admin/empresas-pendientes-aprobacion').then(xd),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const empresasPendCount = (empresasPend as any[]).length;

  const [rechazarEmpModal, setRechazarEmpModal] = useState<any>(null);
  const [motivoRechEmp,    setMotivoRechEmp]    = useState('');

  const aprobarEmpresaMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/empresas/${id}/aprobar-empresa`).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-empresas-pendientes'] });
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      message.success(res?.mensaje ?? 'Empresa aprobada');
      refetchEmpPend();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al aprobar'),
  });

  const rechazarEmpresaMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post(`/admin/empresas/${id}/rechazar-empresa`, { motivo }).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-empresas-pendientes'] });
      setRechazarEmpModal(null); setMotivoRechEmp('');
      message.success(res?.mensaje ?? 'Empresa rechazada');
    },
    onError: () => message.error('Error al rechazar'),
  });

  // ── Eliminar / suspender / activar usuario ──────────────────────────────
  const [eliminarModal,    setEliminarModal]    = useState<any>(null);
  const [hardDeleteUsu,    setHardDeleteUsu]    = useState<any>(null);
  const [hardDeleteEmp,    setHardDeleteEmp]    = useState<any>(null);
  const [confirmHardUsu,   setConfirmHardUsu]   = useState('');
  const [confirmHardEmp,   setConfirmHardEmp]   = useState('');

  const eliminarUsuarioMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/usuarios/${id}`).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-usuarios'] });
      message.success(res?.mensaje ?? 'Usuario eliminado');
      setEliminarModal(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al eliminar usuario'),
  });

  const suspenderUsuarioMut = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/usuarios/${id}/suspender`).then(xd),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['sa-usuarios'] }); message.success(res?.mensaje ?? 'Usuario suspendido'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const activarUsuarioMut = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/usuarios/${id}/activar`).then(xd),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['sa-usuarios'] }); message.success(res?.mensaje ?? 'Usuario activado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const hardDeleteUsuMut = useMutation({
    mutationFn: ({ id, confirmacion }: { id: number; confirmacion: string }) =>
      api.delete(`/admin/usuarios/${id}/permanente`, { data: { confirmacion } }).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-usuarios'] });
      message.success(res?.mensaje ?? 'Eliminado permanentemente');
      setHardDeleteUsu(null); setConfirmHardUsu('');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const hardDeleteEmpMut = useMutation({
    mutationFn: ({ id, confirmacion }: { id: number; confirmacion: string }) =>
      api.delete(`/admin/empresas/${id}/permanente`, { data: { confirmacion } }).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      message.success(res?.mensaje ?? 'Empresa eliminada permanentemente');
      setHardDeleteEmp(null); setConfirmHardEmp('');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  // ── Cambiar rol de usuario ────────────────────────────────────────────────
  const [rolModal,    setRolModal]    = useState<any>(null);
  const [nuevoRol,    setNuevoRol]    = useState('');
  const cambiarRolMut = useMutation({
    mutationFn: ({ id, rol }: { id: number; rol: string }) =>
      api.patch(`/admin/usuarios/${id}/rol`, { rol }).then(xd),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['sa-usuarios'] });
      message.success(res?.mensaje ?? 'Rol actualizado');
      setRolModal(null);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al cambiar rol'),
  });

  // Configs e-CF — misma key que EcfConfigTab → cache compartida, sin doble request
  const { data: ecfConfigs = [] } = useQuery({
    queryKey: ['ecf-configs'],
    queryFn:  ecfConfigApi.listar,
    staleTime: 30_000,
  });

  const { data: suscripciones = [], isLoading: loadSus } = useQuery({
    queryKey: ['sa-suscripciones'],
    queryFn:  () => api.get('/admin/suscripciones').then(xd),
    staleTime: 30_000,
  });

  const { data: solicitudes = [], isLoading: loadSolicitudes } = useQuery({
    queryKey: ['sa-solicitudes'],
    queryFn:  () => api.get('/suscripciones/admin/solicitudes').then(xd),
    staleTime: 15_000,
  });
  const solicitudesPendientes: number = (solicitudes as any[]).filter((s: any) => s.estado === 'pendiente').length;

  const { data: pruebas = [], isLoading: loadPruebas } = useQuery({
    queryKey: ['sa-pruebas'],
    queryFn:  () => api.get('/suscripciones/admin/pruebas').then(xd),
    staleTime: 30_000,
  });

  const { data: detalleData, isLoading: loadDetalle } = useQuery({
    queryKey: ['sa-empresa-detalle', detalleEmpresa?.id],
    queryFn:  () => api.get(`/admin/empresas/${detalleEmpresa?.id}`).then(xd),
    enabled:  !!detalleEmpresa?.id,
    staleTime: 10_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const suspenderMut = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/empresas/${id}/suspender`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-empresas'] }); message.success('Empresa suspendida'); },
    onError: () => message.error('Error al suspender empresa'),
  });

  const activarMut = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/empresas/${id}/activar`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-empresas'] }); message.success('Empresa activada'); },
    onError: () => message.error('Error al activar empresa'),
  });

  const eliminarMut = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/empresas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-empresas'] }); message.success('Empresa eliminada'); },
    onError: () => message.error('Error al eliminar empresa'),
  });

  const planMut = useMutation({
    mutationFn: ({ id, plan, meses }: { id: number; plan: string; meses: number }) =>
      api.patch(`/admin/empresas/${id}/plan`, { plan, meses }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      qc.invalidateQueries({ queryKey: ['sa-suscripciones'] });
      qc.invalidateQueries({ queryKey: ['sa-metricas'] });
      setModalPlan(null);
      message.success('Plan actualizado correctamente');
    },
    onError: () => message.error('Error al actualizar plan'),
  });

  const msgMut = useMutation({
    mutationFn: ({ id, ...dto }: any) => api.post(`/admin/empresas/${id}/mensaje`, dto),
    onSuccess: () => { setModalMsg(null); formMsg.resetFields(); message.success('Mensaje enviado'); },
    onError: () => message.error('Error al enviar mensaje'),
  });

  const setVenceMut = useMutation({
    mutationFn: ({ id, fecha, motivo }: { id: number; fecha: string; motivo: string }) =>
      api.patch(`/admin/empresas/${id}/vencimiento-manual`, { fecha, motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      setModalVence(null); setVenceFecha(null); setVenceMotivo('');
      message.success('Vencimiento manual fijado');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al fijar vencimiento'),
  });

  const resetVenceMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.delete(`/admin/empresas/${id}/vencimiento-manual`, { data: { motivo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-empresas'] });
      message.success('Vencimiento restablecido al automático');
    },
    onError: () => message.error('Error al restablecer vencimiento'),
  });

  // ── Filtros ───────────────────────────────────────────────────────────────────

  const empresasFiltradas = useMemo(() => {
    return (empresas as any[]).filter(e => {
      const matchBusq = !busqueda || e.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || e.rnc?.includes(busqueda);
      const matchPlan = !filtroPlan || e.plan === filtroPlan;
      const matchEst  = !filtroEstado ||
        (filtroEstado === 'activa' && e.isActive) ||
        (filtroEstado === 'suspendida' && !e.isActive) ||
        (filtroEstado === 'vencida' && e.venceSuscripcion && new Date(e.venceSuscripcion) < new Date());
      return matchBusq && matchPlan && matchEst;
    });
  }, [empresas, busqueda, filtroPlan, filtroEstado]);

  // ── Datos para gráficas ───────────────────────────────────────────────────────

  const donaData = (metricas?.distribucionPlanes ?? []).map((p: any) => ({
    name: p.plan?.toUpperCase() ?? 'SIN PLAN',
    value: p.cantidad,
    color: PLAN_COLOR[p.plan] ?? '#64748B',
  }));

  const barrasIngresos = PLANES.filter(p => p.mrrUsd > 0).map(p => {
    const cnt = (metricas?.distribucionPlanes ?? []).find((x: any) => x.plan === p.value)?.cantidad ?? 0;
    return { plan: p.label, mrrUsd: +(cnt * p.mrrUsd).toFixed(2) };
  });

  // Top empresas por facturas del mes
  const topEmpresas = [...(empresas as any[])]
    .sort((a, b) => (b.facturasMes ?? 0) - (a.facturasMes ?? 0))
    .slice(0, 10);

  // ── Columnas tablas ──────────────────────────────────────────────────────────

  const colsEmpresas = [
    // ── EMPRESA (nombre + RNC) ────────────────────────────────────────────────
    {
      title: 'Empresa', key: 'empresa',
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: r.isActive ? `${C.blue}33` : `${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: r.isActive ? C.blue : C.txt2, fontWeight: 800, fontSize: 13,
          }}>{r.nombre?.charAt(0)?.toUpperCase() ?? '?'}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.txt, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
            <div style={{ color: C.txt2, fontSize: 11 }}>RNC: {r.rnc ?? '—'}</div>
          </div>
        </div>
      ),
    },
    // ── PLAN ─────────────────────────────────────────────────────────────────
    { title: 'Plan', key: 'plan', width: 120,
      render: (_: any, r: any) => <PlanBadge plan={r.plan} />,
    },
    // ── ESTADO ───────────────────────────────────────────────────────────────
    { title: 'Estado', key: 'estado', width: 110,
      render: (_: any, r: any) => <EstadoBadge activa={r.isActive} />,
    },
    // ── VENCIMIENTO con urgencia ──────────────────────────────────────────────
    { title: 'Vencimiento', key: 'vence', width: 140,
      render: (_: any, r: any) => {
        const isManual = r.vencimientoOverride != null;
        const v = isManual ? r.vencimientoOverride : r.venceSuscripcion;
        if (!v) return <span style={{ color: C.txt2, fontSize: 12 }}>—</span>;
        const dias = Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000);
        const urgente  = dias < 0;
        const critico  = dias >= 0 && dias < 3;
        const advertencia = dias >= 3 && dias < 7;
        const color = urgente || critico ? C.red : advertencia ? C.gold : C.txt2;
        const icon  = urgente ? '🚨' : critico || advertencia ? '⚠️' : '';
        const label = urgente
          ? `Venció hace ${Math.abs(dias)}d`
          : dias === 0 ? 'Vence hoy'
          : `Vence en ${dias}d`;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: C.txt, fontSize: 12 }}>{fmtFecha(v)}</span>
              {isManual && <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>Manual</Tag>}
            </div>
            <div style={{ color, fontSize: 11, fontWeight: urgente || critico ? 700 : 500 }}>
              {icon} {label}
            </div>
          </div>
        );
      },
    },
    // ── TELÉFONO ──────────────────────────────────────────────────────────────
    { title: 'Teléfono', key: 'telefono', width: 120,
      render: (_: any, r: any) => (
        <span style={{ color: C.txt2, fontSize: 12 }}>{r.telefono ?? '—'}</span>
      ),
    },
    // ── SECTOR ───────────────────────────────────────────────────────────────
    { title: 'Sector', key: 'sector', width: 160,
      render: (_: any, r: any) => {
        const s = SECTORES_EMPRESARIALES.find(x => x.value === r.sector);
        if (!s && !r.sector) return <span style={{ color: C.txt2, fontSize: 12 }}>—</span>;
        return (
          <div>
            <Tag color="blue" style={{ fontSize: 11, marginBottom: s?.addon ? 2 : 0 }}>
              {s?.label ?? r.sector}
            </Tag>
            {s?.addon && (
              <Tag color="green" style={{ fontSize: 10 }}>💡 {s.addon}</Tag>
            )}
          </div>
        );
      },
    },
    // ── ACCIONES: Eye + Dropdown ───────────────────────────────────────────────
    {
      title: '', key: 'acc', width: 80, fixed: 'right' as const,
      render: (_: any, r: any) => {
        const tieneEcf = (ecfConfigs as any[]).some((c: any) => c.empresaId === r.id);
        const menuItems: MenuProps['items'] = [
          {
            key: 'plan', icon: <Edit2 size={13} />, label: 'Cambiar plan',
            onClick: () => { setModalPlan(r); setPlanSel(r.plan ?? 'emprendedor'); setMeses(1); },
          },
          {
            key: 'msg', icon: <MessageSquare size={13} />, label: 'Enviar mensaje',
            onClick: () => setModalMsg(r),
          },
          {
            key: 'ecf', icon: <FileText size={13} />,
            label: tieneEcf ? 'Editar config e-CF' : 'Nueva config e-CF',
            onClick: () => { setTab('ecf'); setEcfTargetId(r.id); },
          },
          {
            key: 'vence-manual', icon: <ClockIcon size={13} />,
            label: 'Fijar vencimiento manual',
            onClick: () => { setModalVence(r); setVenceFecha(null); setVenceMotivo(''); },
          },
          ...(r.vencimientoOverride != null ? [{
            key: 'vence-reset', icon: <RefreshCw size={13} />,
            label: 'Restablecer vencimiento automático',
            onClick: () => Modal.confirm({
              title: '¿Restablecer vencimiento automático?',
              content: 'Se eliminará el override manual y se usará la fecha calculada desde los pagos.',
              okText: 'Restablecer', cancelText: 'Cancelar',
              onOk: () => resetVenceMut.mutate({ id: r.id, motivo: 'Restablecido desde menú' }),
            }),
          }] : []),
          { type: 'divider' },
          r.isActive
            ? {
                key: 'suspend', icon: <PauseCircle size={13} />, label: 'Suspender',
                danger: true,
                onClick: () => {
                  Modal.confirm({
                    title: '¿Suspender esta empresa?',
                    okText: 'Suspender', okButtonProps: { danger: true }, cancelText: 'Cancelar',
                    onOk: () => suspenderMut.mutate(r.id),
                  });
                },
              }
            : {
                key: 'activate', icon: <PlayCircle size={13} />, label: 'Activar',
                onClick: () => activarMut.mutate(r.id),
              },
          { type: 'divider' },
          {
            key: 'delete', icon: <Trash2 size={13} />, label: 'Eliminar empresa (soft)',
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: '¿Eliminar empresa?',
                content: 'Esta acción desactivará la empresa y cancelará su suscripción.',
                okText: 'Eliminar', okButtonProps: { danger: true }, cancelText: 'Cancelar',
                onOk: () => eliminarMut.mutate(r.id),
              });
            },
          },
          {
            key: 'hard-delete', icon: <span>💀</span>, label: '⚠ Eliminar PERMANENTEMENTE',
            danger: true,
            onClick: () => { setHardDeleteEmp(r); setConfirmHardEmp(''); },
          },
        ];

        return (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Tooltip title="Ver detalle">
              <button onClick={() => setDetalleEmpresa(r)} style={btnStyle('#3B82F6')}>
                <Eye size={13} />
              </button>
            </Tooltip>
            <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
              <button style={btnStyle(C.txt2, false, false)}>
                <MoreHorizontal size={14} />
              </button>
            </Dropdown>
          </div>
        );
      },
    },
  ];

  const colsUsuarios = [
    {
      title: 'Usuario', key: 'usuario', width: 200,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: r.role === 'super_admin' ? `${C.gold}33` : `${C.blue}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: r.role === 'super_admin' ? C.gold : C.blue, fontWeight: 700, fontSize: 13,
          }}>{r.nombre?.charAt(0) ?? '?'}</div>
          <div>
            <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>{r.nombre}</div>
            <div style={{ color: C.txt2, fontSize: 11 }}>{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Rol', dataIndex: 'role', key: 'role', width: 170,
      render: (v: string, r: any) => {
        const isSelf = r.id === /* no self-change */ undefined; // backend already blocks it
        return (
          <Select
            size="small"
            value={v}
            style={{ width: 160 }}
            loading={cambiarRolMut.isPending && rolModal?.id === r.id}
            onChange={(nuevoRol: string) => {
              if (nuevoRol === v) return;
              if (nuevoRol === 'super_admin') {
                Modal.confirm({
                  title: '⚠️ Asignar Super Admin',
                  content: `¿Confirmas asignar Super Admin a ${r.nombre}? Tendrá acceso total al sistema.`,
                  okText: 'Sí, asignar',
                  okButtonProps: { danger: true },
                  cancelText: 'Cancelar',
                  onOk: () => {
                    setRolModal(r);
                    cambiarRolMut.mutate({ id: r.id, rol: nuevoRol });
                  },
                });
              } else {
                setRolModal(r);
                cambiarRolMut.mutate({ id: r.id, rol: nuevoRol });
              }
            }}
            options={[
              { value: 'viewer',      label: 'Viewer' },
              { value: 'vendedor',    label: 'Vendedor' },
              { value: 'contador',    label: 'Contador' },
              { value: 'admin',       label: 'Admin' },
              { value: 'super_admin', label: '★ Super Admin' },
            ]}
          />
        );
      },
    },
    { title: 'Empresas', dataIndex: 'empresas', key: 'empresas', width: 80, align: 'center' as const,
      render: (v: number) => <span style={{ color: C.txt }}>{v}</span>,
    },
    { title: 'Estado', dataIndex: 'isActive', key: 'estado', width: 100,
      render: (v: boolean) => <EstadoBadge activa={v} />,
    },
    { title: 'Registro', dataIndex: 'registro', key: 'reg', width: 110,
      render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{fmtFecha(v)}</span>,
    },
    {
      title: 'Acciones', key: 'acciones', width: 140, align: 'center' as const,
      render: (_: any, r: any) => {
        const esSA   = r.role === 'super_admin';
        const esYo   = r.id === user?.id;
        const bloque = esSA || esYo;
        const tipBlock = esSA ? 'No aplica a Super Admin' : 'No aplica a tu cuenta';
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {/* Suspender / Activar */}
            {r.isActive ? (
              <button title={bloque ? tipBlock : 'Suspender acceso'} disabled={bloque}
                onClick={() => !bloque && suspenderUsuarioMut.mutate(r.id)}
                style={{ background: 'transparent', border: '1px solid #F59E0B44', borderRadius: 6,
                  cursor: bloque ? 'not-allowed' : 'pointer', color: '#F59E0B', opacity: bloque ? 0.3 : 1, padding: '3px 7px', fontSize: 11 }}>
                ⏸
              </button>
            ) : (
              <button title={esSA ? tipBlock : 'Activar usuario'} disabled={esSA}
                onClick={() => !esSA && activarUsuarioMut.mutate(r.id)}
                style={{ background: 'transparent', border: `1px solid ${C.green}44`, borderRadius: 6,
                  cursor: esSA ? 'not-allowed' : 'pointer', color: C.green, opacity: esSA ? 0.3 : 1, padding: '3px 7px', fontSize: 11 }}>
                ▶
              </button>
            )}
            {/* Soft delete */}
            <button title={bloque ? tipBlock : 'Eliminar (desactivar)'}
              disabled={bloque} onClick={() => !bloque && setEliminarModal(r)}
              style={{ background: 'transparent', border: `1px solid ${C.red}44`, borderRadius: 6,
                cursor: bloque ? 'not-allowed' : 'pointer', color: C.red, opacity: bloque ? 0.3 : 1, padding: '3px 7px' }}>
              <Trash2 size={12} strokeWidth={2} />
            </button>
            {/* Hard delete */}
            <button title={bloque ? tipBlock : '⚠ Eliminar permanentemente'}
              disabled={bloque} onClick={() => !bloque && (setHardDeleteUsu(r), setConfirmHardUsu(''))}
              style={{ background: 'transparent', border: `1px solid ${C.red}66`, borderRadius: 6,
                cursor: bloque ? 'not-allowed' : 'pointer', color: C.red, opacity: bloque ? 0.3 : 1, padding: '3px 7px', fontWeight: 700, fontSize: 11 }}>
              💀
            </button>
          </div>
        );
      },
    },
  ];

  const colsSuscripciones = [
    { title: 'Empresa', dataIndex: 'empresa', key: 'empresa', width: 180,
      render: (v: string) => <span style={{ color: C.txt, fontWeight: 600 }}>{v}</span>,
    },
    { title: 'RNC', dataIndex: 'rnc', key: 'rnc', width: 110,
      render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{v}</span>,
    },
    { title: 'Plan', dataIndex: 'plan', key: 'plan', width: 110,
      render: (v: string) => <PlanBadge plan={v} />,
    },
    { title: 'US$/mes', key: 'mrr', width: 110, align: 'right' as const,
      render: (_: any, r: any) => (
        <span style={{ color: C.gold, fontWeight: 600 }}>
          {r.plan !== 'trial' && PLAN_MRR_USD[r.plan] > 0 ? fmtUsd(PLAN_MRR_USD[r.plan]) : <span style={{ color: C.txt2 }}>—</span>}
        </span>
      ),
    },
    { title: 'Inicio', dataIndex: 'fechaInicio', key: 'inicio', width: 100,
      render: (v: string) => <span style={{ color: C.txt2, fontSize: 12 }}>{fmtFecha(v)}</span>,
    },
    { title: 'Vencimiento', dataIndex: 'fechaVencimiento', key: 'vence', width: 130,
      render: (v: string, r: any) => {
        const { texto, color } = fmtRelativa(v);
        return (
          <div>
            <div style={{ color: C.txt, fontSize: 12 }}>{fmtFecha(v)}</div>
            <div style={{ color, fontSize: 11, fontWeight: 600 }}>{texto}</div>
          </div>
        );
      },
    },
    { title: 'Estado', dataIndex: 'estado', key: 'estado', width: 100,
      render: (v: string, r: any) => {
        const dias = r.diasRestantes ?? 999;
        const color = dias < 0 ? C.red : dias < 7 ? C.red : dias < 30 ? C.gold : C.green;
        return <span style={{ color, fontWeight: 600, fontSize: 12 }}>{v?.toUpperCase()}</span>;
      },
    },
    { title: 'Acciones', key: 'acc', width: 150,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { setModalPlan(r); setPlanSel(r.plan ?? 'profesional'); setMeses(1); }}
            style={btnStyle('#8B5CF6')}>
            <Edit2 size={13} />
            <span style={{ marginLeft: 4, fontSize: 11 }}>Cambiar plan</span>
          </button>
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SaThemeCtx.Provider value={C}>
    {/* ConfigProvider LOCAL — independiente del tema del ERP principal */}
    <ConfigProvider
      theme={{
        cssVar:    true,
        hashed:    false,
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary:   C.gold,
          fontFamily:     '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
          fontSize:        13,
          borderRadius:    4,
          colorBgBase:        isDark ? '#0F172A' : '#F1F5F9',
          colorBgContainer:   isDark ? '#1E293B' : '#FFFFFF',
          colorBgLayout:      isDark ? '#0F172A' : '#F1F5F9',
          colorBgElevated:    isDark ? '#1E293B' : '#FFFFFF',
          colorBgSpotlight:   isDark ? '#334155' : '#F8FAFC',
          colorText:          isDark ? '#F8FAFC' : '#0F172A',
          colorTextSecondary: isDark ? '#94A3B8' : '#64748B',
          colorBorder:        isDark ? '#334155' : '#E2E8F0',
          colorBorderSecondary: isDark ? '#1E293B' : '#F1F5F9',
          colorFill:          isDark ? '#334155' : '#F1F5F9',
          colorFillSecondary: isDark ? '#1E293B' : '#F8FAFC',
          colorFillAlter:     isDark ? '#1E293B' : '#F8FAFC',
        },
        components: {
          // ⚠️ ESTE COMPONENTE CONTROLA EL TEMA DEL SUPER ADMIN
          // Los tokens aquí DEBEN anular cualquier regla global de darkmode.css
          Table: {
            borderRadius:      3,
            headerBg:          isDark ? '#1E293B' : '#F8FAFC',
            headerColor:       isDark ? '#94A3B8' : '#475569',
            rowHoverBg:        isDark ? '#1a2535' : '#F0F4F8',
            colorBgContainer:  isDark ? '#0F172A' : '#FFFFFF',
            borderColor:       isDark ? '#334155' : '#E2E8F0',
            cellPaddingBlock:  6,
            cellPaddingInline: 12,
            fontSize:          13,
          },
          Card: {
            colorBgContainer:   isDark ? '#1E293B' : '#FFFFFF',
            colorBorderSecondary: isDark ? '#334155' : '#E2E8F0',
            borderRadius:       8,
          },
          Input: {
            colorBgContainer:     isDark ? '#1E293B' : '#FFFFFF',
            colorBorder:          isDark ? '#334155' : '#E2E8F0',
            colorText:            isDark ? '#F8FAFC' : '#0F172A',
            colorTextPlaceholder: isDark ? '#64748B' : '#94A3B8',
            borderRadius:         4,
            fontSize:             13,
          },
          Select: {
            colorBgContainer:  isDark ? '#1E293B' : '#FFFFFF',
            colorBgElevated:   isDark ? '#1E293B' : '#FFFFFF',
            colorBorder:       isDark ? '#334155' : '#E2E8F0',
            colorText:         isDark ? '#F8FAFC' : '#0F172A',
            borderRadius:      4,
            fontSize:          13,
          },
          Modal: {
            contentBg:   isDark ? '#1E293B' : '#FFFFFF',
            headerBg:    isDark ? '#1E293B' : '#FFFFFF',
            borderRadius: 6,
          },
          Drawer: {
            colorBgElevated: isDark ? '#1E293B' : '#FFFFFF',
          },
          Dropdown: {
            colorBgElevated: isDark ? '#1E293B' : '#FFFFFF',
            colorBorder:     isDark ? '#334155' : '#E2E8F0',
          },
          InputNumber: {
            colorBgContainer: isDark ? '#1E293B' : '#FFFFFF',
            colorBorder:      isDark ? '#334155' : '#E2E8F0',
            colorText:        isDark ? '#F8FAFC' : '#0F172A',
          },
          Tabs:       { inkBarColor: C.gold, itemActiveColor: C.gold, titleFontSize: 13 },
          Button:     { borderRadius: 4, fontSize: 13 },
          Tag:        { borderRadius: 3, fontSize: 11 },
          Pagination: { fontSize: 12 },
        },
      }}
    >
    <div className={`sa-scope${isDark ? '' : ' sa-light'}`} style={{ minHeight: '100vh', background: C.bg, fontFamily: '"IBM Plex Sans", sans-serif', color: C.txt, transition: 'all 300ms ease' }}>

      {/* ── BARRA DORADA TOP ───────────────────────────────────────────────── */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${C.gold}, #FCD34D, ${C.gold})` }} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header style={{
        background: '#0A1628',
        borderBottom: `1px solid ${C.border}`,
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.gold}, #FCD34D)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 18, color: '#0A1628',
          }}>H</div>
          <div>
            <div style={{ color: C.txt, fontWeight: 800, fontSize: 15, lineHeight: 1 }}>HiCloud ERP</div>
            <span style={{
              background: `${C.gold}22`, color: C.gold, border: `1px solid ${C.gold}66`,
              borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em',
            }}>SUPER ADMIN</span>
          </div>
        </div>

        {/* Centro */}
        <div style={{ color: C.txt2, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} style={{ color: C.gold }} />
          Panel de Administración Global
        </div>

        {/* Derecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LiveClock />
          <span style={{ color: C.txt2, fontSize: 13 }}>{user?.email}</span>

          {/* Toggle oscuro/claro — independiente del ERP */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            style={{
              background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              color: '#F59E0B', transition: 'all 200ms ease',
            }}>
            {isDark
              ? <><Sun size={14} /><span style={{ fontSize: 11, fontWeight: 600 }}>Claro</span></>
              : <><Moon size={14} /><span style={{ fontSize: 11, fontWeight: 600 }}>Oscuro</span></>
            }
          </button>

          <button
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44`,
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
            }}>
            <LogOut size={14} /> Salir
          </button>
        </div>
      </header>

      <div style={{ padding: '28px 32px', maxWidth: 1600, margin: '0 auto' }}>

        {/* ── TÍTULO + ACCIONES ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: C.txt, fontWeight: 800, fontSize: 22, margin: 0 }}>
              Administración Global
            </h1>
            <p style={{ color: C.txt2, margin: '4px 0 0', fontSize: 13 }}>
              Control total de empresas, usuarios y suscripciones de HiCloud ERP
            </p>
          </div>
          <button
            onClick={() => { qc.invalidateQueries(); }}
            style={{ ...btnStyle(C.blue, false, true), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        {/* ── KPI CARDS ─────────────────────────────────────────────────────── */}
        {loadMet ? (
          <div style={{ textAlign: 'center', padding: 32 }}><Spin size="large" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            <KpiCard
              icon={<Building2 size={20} />}
              label="Empresas Activas"
              value={metricas?.empresasActivas ?? 0}
              sub={`${metricas?.totalEmpresas ?? 0} total en la plataforma`}
              accent={C.blue}
            />
            <KpiCard
              icon={<Users size={20} />}
              label="Usuarios Totales"
              value={metricas?.totalUsuarios ?? 0}
              sub={metricas?.nuevosHoy > 0 ? `+${metricas.nuevosHoy} nuevos hoy` : 'Sin nuevos hoy'}
              subColor={metricas?.nuevosHoy > 0 ? C.green : C.txt2}
              accent={C.green}
            />
            <KpiCard
              icon={<FileText size={20} />}
              label="Facturas del Mes"
              value={metricas?.facturasMes ?? 0}
              sub={metricas?.montoFacturasMes > 0 ? `RD$ ${Number(metricas.montoFacturasMes).toLocaleString('es-DO', { maximumFractionDigits: 0 })} facturado` : `${metricas?.facturasHoy ?? 0} hoy`}
              subColor={C.txt2}
              accent="#F97316"
            />
            <KpiCard
              icon={<DollarSign size={20} />}
              label="MRR Suscripciones"
              value={fmtUsd(metricas?.mrrUsd ?? 0)}
              sub="USD · ingresos propios del SaaS"
              subColor={C.gold}
              accent={C.gold}
            />
            <KpiCard
              icon={<ClockIcon size={20} />}
              label="Empresas en Trial"
              value={metricas?.empresasEnTrial ?? 0}
              sub={metricas?.trialsProximosVencer > 0 ? `⚠ ${metricas.trialsProximosVencer} vencen en 7 días` : 'Sin vencimientos próximos'}
              subColor={metricas?.trialsProximosVencer > 0 ? C.gold : C.txt2}
              accent={C.gold}
            />
            <KpiCard
              icon={<XCircle size={20} />}
              label="Suscripciones Vencidas"
              value={metricas?.suscripcionesVencidas ?? 0}
              sub={metricas?.suscripcionesVencidas > 0 ? '⚠ Requieren atención' : 'Todo al día'}
              subColor={metricas?.suscripcionesVencidas > 0 ? C.red : C.green}
              accent={metricas?.suscripcionesVencidas > 0 ? C.red : C.green}
            />
            <KpiCard
              icon={<BarChart2 size={20} />}
              label="e-CFs Generados Hoy"
              value={metricas?.ecfHoy ?? 0}
              sub="Comprobantes fiscales electrónicos"
              accent={C.purple}
            />
            <KpiCard
              icon={<Globe size={20} />}
              label="Sesiones Activas"
              value={Math.max(1, Math.floor((metricas?.totalUsuarios ?? 0) * 0.15))}
              sub="Estimado en tiempo real"
              subColor={C.txt2}
              accent={C.blue}
            />
          </div>
        )}

        {/* ── LAYOUT: SIDEBAR + CONTENIDO ──────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', minHeight: 560 }}>

          {/* ── SIDEBAR VERTICAL IZQUIERDO ──────────────────────────────────── */}
          <nav style={{
            width: 220, flexShrink: 0,
            background: C.bg, borderRight: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', padding: '12px 0',
          }}>
            {/* Grupo GESTIÓN */}
            <div style={{ padding: '4px 16px 6px', color: C.txt2, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>
              Gestión
            </div>
            {[
              { key: 'empresas',      icon: <Building2 size={15} />,  label: 'Empresas',      count: (empresas as any[]).length, countColor: C.blue },
              { key: 'usuarios',      icon: <Users size={15} />,      label: 'Usuarios',      count: (usuarios as any[]).length, countColor: C.blue },
              { key: 'pendientes',    icon: <ClockIcon size={15} />,  label: 'Pendientes',    count: pendientesCount + empresasPendCount, countColor: C.red, badge: (pendientesCount + empresasPendCount) > 0 },
              { key: 'suscripciones', icon: <Crown size={15} />,      label: 'Suscripciones', count: (suscripciones as any[]).length, countColor: C.blue },
              { key: 'cobros',        icon: <DollarSign size={15} />, label: 'Cobros',        count: 0, countColor: C.gold },
              { key: 'solicitudes',   icon: <Send size={15} />,       label: 'Solicitudes',   count: solicitudesPendientes ?? 0, countColor: C.red, badge: true },
              { key: 'demos',         icon: <MessageSquare size={15} />, label: 'Demos',       count: demosNuevas, countColor: C.red, badge: demosNuevas > 0 },
              { key: 'pruebas',       icon: <ClockIcon size={15} />,  label: 'En Prueba',     count: (pruebas as any[]).length, countColor: C.gold },
              { key: 'auditoria',     icon: <Shield size={15} />,     label: 'Auditoría',     count: 0, countColor: C.blue },
            ].map(t => {
              const activo = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  width: '100%', border: 'none', cursor: 'pointer',
                  padding: '9px 16px 9px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderLeft: `3px solid ${activo ? C.gold : 'transparent'}`,
                  background: activo ? `${C.gold}18` : 'none',
                  color: activo ? C.gold : C.txt2,
                  fontWeight: activo ? 700 : 500, fontSize: 13,
                  transition: 'all .15s', textAlign: 'left',
                }}
                  onMouseEnter={e => { if (!activo) e.currentTarget.style.background = `${C.border}66`; }}
                  onMouseLeave={e => { if (!activo) e.currentTarget.style.background = 'none'; }}>
                  <span style={{ flexShrink: 0, color: activo ? C.gold : C.txt2 }}>{t.icon}</span>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                  {t.count > 0 && (
                    <span style={{
                      background: t.badge ? C.red : activo ? `${C.gold}33` : C.border,
                      color: t.badge ? '#fff' : activo ? C.gold : C.txt2,
                      borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>{t.count}</span>
                  )}
                </button>
              );
            })}

            {/* Grupo SISTEMA */}
            <div style={{ padding: '12px 16px 6px', color: C.txt2, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 8 }}>
              Sistema
            </div>
            {[
              { key: 'metricas',      icon: <BarChart2 size={15} />,  label: 'Métricas MRR' },
              { key: 'ecf',           icon: <FileText size={15} />,   label: 'e-CF Config' },
              { key: 'modulos',       icon: <span style={{ fontSize: 15 }}>🧩</span>, label: 'Módulos Add-on' },
              { key: 'herramientas',  icon: <Settings size={15} />,   label: 'Herramientas' },
              { key: 'config',        icon: <Settings size={15} />,   label: 'Configuración' },
            ].map(t => {
              const activo = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  width: '100%', border: 'none', cursor: 'pointer',
                  padding: '9px 16px 9px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderLeft: `3px solid ${activo ? C.gold : 'transparent'}`,
                  background: activo ? `${C.gold}18` : 'none',
                  color: activo ? C.gold : C.txt2,
                  fontWeight: activo ? 700 : 500, fontSize: 13,
                  transition: 'all .15s', textAlign: 'left',
                }}
                  onMouseEnter={e => { if (!activo) e.currentTarget.style.background = `${C.border}66`; }}
                  onMouseLeave={e => { if (!activo) e.currentTarget.style.background = 'none'; }}>
                  <span style={{ flexShrink: 0, color: activo ? C.gold : C.txt2 }}>{t.icon}</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                </button>
              );
            })}

            {/* Separador + Refresh */}
            <div style={{ marginTop: 'auto', borderTop: `1px solid ${C.border}`, padding: '12px 12px 4px' }}>
              <button
                onClick={() => qc.invalidateQueries()}
                style={{
                  width: '100%', background: 'none', border: `1px solid ${C.border}`,
                  cursor: 'pointer', padding: '7px 12px', borderRadius: 6,
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: C.txt2, fontSize: 12, fontWeight: 500,
                }}>
                <RefreshCw size={13} /> Actualizar datos
              </button>
            </div>
          </nav>

          {/* ── CONTENT AREA ────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, padding: 24, overflow: 'auto' }}>

            {/* ── TAB EMPRESAS ──────────────────────────────────────────────── */}
            {tab === 'empresas' && (
              <>
                {/* Filtros */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                  <Input
                    placeholder="Buscar por nombre o RNC..."
                    prefix={<Search size={14} style={{ color: C.txt2 }} />}
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ width: 260, background: C.bg, borderColor: C.border, color: C.txt }}
                    allowClear
                  />
                  <Select
                    placeholder="Filtrar por plan"
                    value={filtroPlan || undefined} onChange={v => setFiltroPlan(v ?? '')}
                    allowClear style={{ width: 180 }}
                    options={PLANES_ACTIVOS.map(p => ({ value: p.value, label: p.label }))}
                  />
                  <Select
                    placeholder="Filtrar por estado"
                    value={filtroEstado || undefined} onChange={v => setFiltroEstado(v ?? '')}
                    allowClear style={{ width: 160 }}
                    options={[
                      { value: 'activa', label: '● Activa' },
                      { value: 'suspendida', label: '● Suspendida' },
                      { value: 'vencida', label: '● Vencida' },
                    ]}
                  />
                  <div style={{ marginLeft: 'auto', color: C.txt2, fontSize: 13, display: 'flex', alignItems: 'center' }}>
                    {empresasFiltradas.length} de {(empresas as any[]).length} empresas
                  </div>
                </div>

                <Table
                  dataSource={empresasFiltradas}
                  columns={colsEmpresas}
                  loading={loadEmp}
                  rowKey="id"
                  size="small"
                  scroll={{ x: 'max-content' }}
                  onRow={r => ({ onClick: () => setDetalleEmpresa(r), style: { cursor: 'pointer' } })}
                  pagination={{ pageSize: 15, showTotal: t => `${t} empresas`, showSizeChanger: true }}
                  rowClassName={() => 'sa-row'}
                  style={{ '--sa-row-bg': C.bg, '--sa-row-hover': isDark ? '#1a2535' : '#EEF2FF' } as any}
                />
              </>
            )}

            {/* ── TAB USUARIOS ──────────────────────────────────────────────── */}
            {/* ── TAB PENDIENTES ───────────────────────────────────────────── */}
            {tab === 'pendientes' && (
              <>
                {pendientesCount === 0 && !loadPendientes ? (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <CheckCircle size={48} color={C.green} style={{ marginBottom: 12 }} />
                    <p style={{ color: C.txt2, fontSize: 15 }}>No hay solicitudes pendientes</p>
                  </div>
                ) : (
                  <Table
                    dataSource={pendientes as any[]}
                    loading={loadPendientes}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 720 }}
                    pagination={{ pageSize: 15, showTotal: t => `${t} solicitudes` }}
                    columns={[
                      {
                        title: 'Usuario',
                        render: (_: any, r: any) => (
                          <div>
                            <div style={{ fontWeight: 600, color: C.txt }}>{r.nombre}</div>
                            <div style={{ color: C.txt2, fontSize: 12 }}>{r.email}</div>
                          </div>
                        ),
                      },
                      {
                        title: 'Empresa',
                        render: (_: any, r: any) => r.empresa
                          ? <span style={{ color: C.txt }}>{r.empresa} <span style={{ color: C.txt2 }}>({r.rnc})</span></span>
                          : <span style={{ color: C.txt2 }}>—</span>,
                      },
                      {
                        title: 'Plan',
                        dataIndex: 'plan',
                        render: (v: string) => v ? <Tag color="gold">{v}</Tag> : '—',
                      },
                      {
                        title: 'Registro via',
                        dataIndex: 'provider',
                        render: (v: string) => (
                          <Tag color={v === 'GOOGLE' ? 'blue' : 'default'}>{v === 'GOOGLE' ? '🔵 Google' : '✉ Email'}</Tag>
                        ),
                      },
                      {
                        title: 'Fecha',
                        dataIndex: 'createdAt',
                        render: (v: string) => fmtFecha(v),
                      },
                      {
                        title: 'Acciones',
                        render: (_: any, r: any) => (
                          <Space>
                            <Button
                              type="primary"
                              size="small"
                              icon={<CheckCircle size={13} />}
                              style={{ background: C.green, borderColor: C.green }}
                              loading={aprobarRegistroMut.isPending}
                              onClick={() => {
                                Modal.confirm({
                                  title: `Aprobar a ${r.nombre}`,
                                  content: `¿Confirmas activar la cuenta de ${r.email}? El usuario recibirá un email de bienvenida.`,
                                  okText: 'Aprobar',
                                  okButtonProps: { style: { background: C.green, borderColor: C.green } },
                                  cancelText: 'Cancelar',
                                  onOk: () => aprobarRegistroMut.mutate(r.id),
                                });
                              }}
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="small"
                              danger
                              icon={<XCircle size={13} />}
                              onClick={() => { setRechazarModal(r); setMotivoRechazo(''); }}
                            >
                              Rechazar
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}

                {/* Modal rechazar */}
                <Modal
                  open={!!rechazarModal}
                  title={`Rechazar solicitud — ${rechazarModal?.nombre}`}
                  onCancel={() => { setRechazarModal(null); setMotivoRechazo(''); }}
                  onOk={() => rechazarRegistroMut.mutate({ id: rechazarModal?.id, motivo: motivoRechazo })}
                  okText="Rechazar"
                  okButtonProps={{ danger: true, loading: rechazarRegistroMut.isPending }}
                  cancelText="Cancelar"
                >
                  <p style={{ marginBottom: 12 }}>
                    Se enviará un email a <strong>{rechazarModal?.email}</strong> informando que su solicitud fue denegada.
                  </p>
                  <Input.TextArea
                    placeholder="Motivo del rechazo (opcional — se incluirá en el email)"
                    value={motivoRechazo}
                    onChange={e => setMotivoRechazo(e.target.value)}
                    rows={3}
                    maxLength={300}
                  />
                </Modal>

                {/* ── Empresas pendientes de aprobación ── */}
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.txt }}>🏢 Empresas pendientes de aprobación</span>
                    {empresasPendCount > 0 && (
                      <span style={{ background: C.red, color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{empresasPendCount}</span>
                    )}
                  </div>
                  {empresasPendCount === 0 && !loadEmpPend ? (
                    <p style={{ color: C.txt2, fontSize: 13 }}>No hay empresas pendientes de aprobación</p>
                  ) : (
                    <Table
                      dataSource={empresasPend as any[]}
                      loading={loadEmpPend}
                      rowKey="id"
                      size="small"
                      scroll={{ x: 720 }}
                      pagination={{ pageSize: 10, showTotal: t => `${t} empresas` }}
                      columns={[
                        { title: 'Empresa', render: (_: any, r: any) => (
                          <div>
                            <div style={{ fontWeight: 600, color: C.txt }}>{r.nombre}</div>
                            <div style={{ color: C.txt2, fontSize: 12 }}>RNC: {r.rnc}</div>
                          </div>
                        )},
                        { title: 'Sector', dataIndex: 'sector', render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
                        { title: 'Solicitante', render: (_: any, r: any) => (
                          <div>
                            <div style={{ color: C.txt }}>{r.solicitanteNombre ?? '—'}</div>
                            <div style={{ color: C.txt2, fontSize: 12 }}>{r.solicitanteEmail ?? '—'}</div>
                          </div>
                        )},
                        { title: 'Fecha', dataIndex: 'createdAt', render: (v: string) => fmtFecha(v) },
                        { title: 'Acciones', render: (_: any, r: any) => (
                          <Space>
                            <Button type="primary" size="small" icon={<CheckCircle size={13} />}
                              style={{ background: C.green, borderColor: C.green }}
                              loading={aprobarEmpresaMut.isPending}
                              onClick={() => Modal.confirm({
                                title: `Aprobar empresa — ${r.nombre}`,
                                content: `¿Confirmas activar la empresa ${r.nombre} (RNC: ${r.rnc})? Se creará un Trial de 15 días y se notificará al solicitante.`,
                                okText: 'Aprobar', cancelText: 'Cancelar',
                                okButtonProps: { style: { background: C.green, borderColor: C.green } },
                                onOk: () => aprobarEmpresaMut.mutateAsync(r.id),
                              })}>
                              Aprobar
                            </Button>
                            <Button size="small" danger onClick={() => { setRechazarEmpModal(r); setMotivoRechEmp(''); }}>
                              Rechazar
                            </Button>
                          </Space>
                        )},
                      ]}
                    />
                  )}
                </div>

                {/* Modal rechazar empresa */}
                <Modal
                  open={!!rechazarEmpModal}
                  title={`Rechazar empresa — ${rechazarEmpModal?.nombre}`}
                  onCancel={() => { setRechazarEmpModal(null); setMotivoRechEmp(''); }}
                  onOk={() => rechazarEmpresaMut.mutate({ id: rechazarEmpModal?.id, motivo: motivoRechEmp })}
                  okText="Rechazar" okButtonProps={{ danger: true, loading: rechazarEmpresaMut.isPending }}
                  cancelText="Cancelar"
                >
                  <p style={{ marginBottom: 12 }}>
                    Se enviará un email a <strong>{rechazarEmpModal?.solicitanteEmail}</strong> con el motivo.
                  </p>
                  <Input.TextArea
                    placeholder="Motivo del rechazo (requerido — se incluirá en el email)"
                    value={motivoRechEmp}
                    onChange={e => setMotivoRechEmp(e.target.value)}
                    rows={3} maxLength={300}
                  />
                </Modal>
              </>
            )}

            {tab === 'usuarios' && (
              <Table
                dataSource={usuarios as any[]}
                columns={colsUsuarios}
                loading={loadUsu}
                rowKey="id"
                size="small"
                scroll={{ x: 720 }}
                pagination={{ pageSize: 15, showTotal: t => `${t} usuarios`, showSizeChanger: true }}
              />
            )}

            {/* ── TAB SUSCRIPCIONES ─────────────────────────────────────────── */}
            {tab === 'suscripciones' && (
              <>
                {/* Resumen rápido */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  {PLANES.map(p => {
                    const cnt = (metricas?.distribucionPlanes ?? []).find((x: any) => x.plan === p.value)?.cantidad ?? 0;
                    return cnt > 0 ? (
                      <div key={p.value} style={{
                        background: C.bg, border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '10px 16px', textAlign: 'center',
                      }}>
                        <div style={{ color: p.color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{p.label}</div>
                        <div style={{ color: C.txt, fontWeight: 800, fontSize: 20 }}>{cnt}</div>
                        {p.mrrUsd > 0 && <div style={{ color: C.gold, fontSize: 11 }}>{fmtUsd(p.mrrUsd)}/mes</div>}
                      </div>
                    ) : null;
                  })}
                </div>

                <Table
                  dataSource={suscripciones as any[]}
                  columns={colsSuscripciones}
                  loading={loadSus}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 15, showTotal: t => `${t} suscripciones` }}
                
        scroll={{ x: 'max-content' }} />
              </>
            )}

            {/* ── TAB MÉTRICAS ──────────────────────────────────────────────── */}
            {tab === 'metricas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                {/* Fila 1: Dona + Barras */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>

                  {/* Distribución por plan */}
                  <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                    <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>Distribución por Plan</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={donaData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                          paddingAngle={3} dataKey="value" nameKey="name">
                          {donaData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <RTooltip
                          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.txt }}
                          formatter={(v: any, n: any) => [v, n]}
                        />
                        <Legend formatter={(v) => <span style={{ color: C.txt2, fontSize: 12 }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Ingresos por plan */}
                  <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                    <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>Ingresos por Plan (USD)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={barrasIngresos} margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="plan" tick={{ fill: C.txt2, fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: C.txt2, fontSize: 11 }} axisLine={false} tickLine={false}
                          tickFormatter={v => `US$${v}`} />
                        <RTooltip
                          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.txt }}
                          formatter={(v: any) => [fmtUsd(Number(v)), 'US$/mes']}
                        />
                        <Bar dataKey="mrrUsd" fill={C.gold} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top 10 empresas por facturas */}
                <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                  <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>
                    Top 10 Empresas por Facturación del Mes
                  </h3>
                  {topEmpresas.length === 0 ? (
                    <Empty description={<span style={{ color: C.txt2 }}>Sin datos de facturación</span>} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {topEmpresas.map((e: any, i: number) => (
                        <div key={e.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          background: C.card, borderRadius: 8, border: `1px solid ${C.border}`,
                        }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: i === 0 ? C.gold : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : C.border,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: 12, color: i < 3 ? '#0A1628' : C.txt2, flexShrink: 0,
                          }}>{i + 1}</span>
                          <span style={{ flex: 1, color: C.txt, fontWeight: 600 }}>{e.nombre}</span>
                          <PlanBadge plan={e.plan} />
                          <span style={{ color: C.txt2, fontSize: 12, minWidth: 80, textAlign: 'right' }}>
                            {e.facturasMes ?? 0} facturas
                          </span>
                          <div style={{ width: 120 }}>
                            <div style={{
                              height: 6, borderRadius: 3, background: C.border,
                              overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%', borderRadius: 3,
                                background: `linear-gradient(90deg, ${C.blue}, ${C.purple})`,
                                width: `${Math.min(100, ((e.facturasMes ?? 0) / Math.max(1, topEmpresas[0].facturasMes ?? 1)) * 100)}%`,
                              }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB e-CF CONFIG ───────────────────────────────────────────── */}
            {tab === 'ecf' && (
              <EcfConfigTab
                C={C}
                targetEmpresaId={ecfTargetId}
                onClearTarget={() => setEcfTargetId(null)}
              />
            )}

            {/* ── TAB MÓDULOS ADD-ON ────────────────────────────────────────── */}
            {tab === 'modulos' && (
              <ModulosAddonTab />
            )}

            {/* ── TAB SOLICITUDES ───────────────────────────────────────────── */}
            {tab === 'solicitudes' && (
              <SolicitudesTab
                C={C}
                solicitudes={solicitudes as any[]}
                isLoading={loadSolicitudes}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['sa-solicitudes'] })}
              />
            )}

            {/* ── TAB EMPRESAS EN PRUEBA ────────────────────────────────────── */}
            {tab === 'pruebas' && (
              <PruebasTab
                C={C}
                pruebas={pruebas as any[]}
                isLoading={loadPruebas}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['sa-pruebas'] })}
              />
            )}

            {/* ── TAB DEMOS ─────────────────────────────────────────────────── */}
            {tab === 'demos' && (
              <DemosTab C={C} />
            )}

            {/* ── TAB COBROS ────────────────────────────────────────────────── */}
            {tab === 'cobros' && (
              <div style={{ padding: '0 4px' }}>
                <CobrosAdminPanel />
              </div>
            )}

            {/* ── TAB AUDITORÍA ─────────────────────────────────────────────── */}
            {tab === 'auditoria' && (
              <AuditoriaTab C={C} />
            )}

            {/* ── TAB HERRAMIENTAS ─────────────────────────────────────────── */}
            {tab === 'herramientas' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Plan de Cuentas — Sincronización */}
                <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
                  <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} style={{ color: C.blue }} /> Plan de Cuentas
                  </h3>
                  <p style={{ color: C.txt2, fontSize: 12, margin: '0 0 18px', lineHeight: 1.5 }}>
                    Agrega cuentas faltantes del catálogo dominicano a empresas existentes sin borrar ni modificar las ya configuradas.
                    Operación idempotente — segura de ejecutar múltiples veces.
                  </p>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: C.txt2, fontSize: 11, marginBottom: 6 }}>
                      Empresa (opcional — dejar vacío para todas las empresas activas)
                    </div>
                    <Select
                      allowClear
                      placeholder="Todas las empresas activas"
                      value={empresaIdFiltro}
                      onChange={(v: number | undefined) => setEmpresaIdFiltro(v)}
                      style={{ width: '100%' }}
                      options={(empresas as any[]).map((e: any) => ({ value: e.id, label: `#${e.id} — ${e.nombre}` }))}
                      showSearch
                      filterOption={(input, opt) =>
                        String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  </div>

                  <button
                    onClick={handleSincronizarPlanCuentas}
                    disabled={loadingSync}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', cursor: loadingSync ? 'not-allowed' : 'pointer',
                      background: loadingSync ? `${C.blue}55` : C.blue, color: '#fff', fontWeight: 700, fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'all .15s', opacity: loadingSync ? 0.7 : 1,
                    }}
                  >
                    {loadingSync ? (
                      <><Spin size="small" style={{ marginRight: 6 }} /> Sincronizando...</>
                    ) : (
                      <><RefreshCw size={14} /> Sincronizar Plan de Cuentas</>
                    )}
                  </button>

                  {syncResult && (
                    <div style={{ marginTop: 16 }}>
                      <Alert
                        type={syncResult.errores.length > 0 ? 'warning' : 'success'}
                        message={
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              {syncResult.errores.length === 0 ? 'Sincronización completada' : 'Sincronización con errores'}
                            </div>
                            <div style={{ fontSize: 12 }}>
                              <span>{syncResult.procesadas} empresa(s) procesadas</span>
                              <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
                              <span style={{ fontWeight: 600, color: '#059669' }}>{syncResult.cuentasAgregadas} cuentas nuevas</span>
                              {syncResult.errores.length > 0 && (
                                <>
                                  <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
                                  <span style={{ color: '#DC2626' }}>{syncResult.errores.length} error(es)</span>
                                </>
                              )}
                            </div>
                            {syncResult.errores.length > 0 && (
                              <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626' }}>
                                {syncResult.errores.map((e, i) => <div key={i}>• {e}</div>)}
                              </div>
                            )}
                          </div>
                        }
                        showIcon
                        style={{ borderRadius: 8 }}
                      />
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── TAB CONFIGURACIÓN ─────────────────────────────────────────── */}
            {tab === 'config' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* Planes y precios — editables */}
                <PlanesEditor C={C} />

                {/* Estado del sistema */}
                <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
                  <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={16} style={{ color: C.blue }} /> Estado del Sistema
                  </h3>
                  {[
                    { label: 'API Backend', status: 'operational', color: C.green },
                    { label: 'Base de datos', status: 'operational', color: C.green },
                    { label: 'Servicio ECF DGII', status: 'operational', color: C.green },
                    { label: 'Servicio de Email', status: 'operational', color: C.green },
                    { label: 'Push Notifications', status: 'operational', color: C.green },
                  ].map(s => (
                    <div key={s.label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ color: C.txt2, fontSize: 13 }}>{s.label}</span>
                      <span style={{
                        color: s.color, fontSize: 12, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <CheckCircle style={{ width: 13, height: 13, flexShrink: 0 }} /> Operacional
                      </span>
                    </div>
                  ))}
                </div>

                {/* Seguridad global editable */}
                <SeguridadGlobalEditor C={C} />

                {/* Parámetros globales */}
                <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, gridColumn: '1 / -1' }}>
                  <h3 style={{ color: C.txt, fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={16} style={{ color: C.txt2 }} /> Parámetros Globales
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {[
                      { label: 'Versión del sistema', value: 'HiCloud ERP v1.0.0' },
                      { label: 'Ambiente', value: 'Producción' },
                      { label: 'País base', value: 'República Dominicana 🇩🇴' },
                      { label: 'Moneda local', value: 'Peso Dominicano (DOP)' },
                      { label: 'Zona horaria', value: 'America/Santo_Domingo' },
                      { label: 'Versión DGII ECF', value: 'e-CF 2024' },
                    ].map(p => (
                      <div key={p.label} style={{
                        background: C.card, borderRadius: 8, padding: '12px 14px',
                        border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ color: C.txt2, fontSize: 11, marginBottom: 4 }}>{p.label}</div>
                        <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>{p.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── MODAL DETALLE EMPRESA ─────────────────────────────────────────────── */}
      <Modal
        open={!!detalleEmpresa}
        onCancel={() => setDetalleEmpresa(null)}
        footer={null}
        width={720}
        title={null}
        styles={{ content: { background: C.card, padding: 0, borderRadius: 14, overflow: 'hidden' }, mask: { background: 'rgba(0,0,0,.7)' } }}
      >
        {detalleEmpresa && (
          <>
            {/* Header modal */}
            <div style={{
              background: `linear-gradient(135deg, #0A1628, #1E293B)`,
              padding: '24px 28px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: `${C.blue}33`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: C.blue,
              }}>{detalleEmpresa.nombre?.charAt(0)}</div>
              <div>
                <h2 style={{ color: C.txt, fontWeight: 800, fontSize: 18, margin: 0 }}>{detalleEmpresa.nombre}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <PlanBadge plan={detalleEmpresa.plan} />
                  <EstadoBadge activa={detalleEmpresa.isActive} />
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ color: C.txt2, fontSize: 12 }}>Vencimiento</div>
                {(() => {
                  const { texto, color } = fmtRelativa(detalleEmpresa.venceSuscripcion);
                  return (
                    <>
                      <div style={{ color: C.txt, fontWeight: 600, fontSize: 13 }}>{fmtFecha(detalleEmpresa.venceSuscripcion)}</div>
                      <div style={{ color, fontSize: 12 }}>{texto}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div style={{ padding: '0 28px 28px' }}>
              {loadDetalle ? (
                <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
              ) : (
                <Tabs
                  defaultActiveKey="datos"
                  size="small"
                  style={{ marginTop: 0 }}
                  items={[
                    {
                      key: 'datos',
                      label: 'Datos',
                      children: (
                        <div style={{ paddingTop: 16 }}>
                          {/* Info */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 24 }}>
                            {[
                              { label: 'RNC', value: detalleEmpresa.rnc },
                              { label: 'Usuarios', value: detalleEmpresa.usuarios ?? 0 },
                              { label: 'Facturas este mes', value: detalleEmpresa.facturasMes ?? 0 },
                              { label: 'Suscripción/mes', value: PLAN_MRR_USD[detalleEmpresa.plan] > 0 ? fmtUsd(PLAN_MRR_USD[detalleEmpresa.plan]) : 'Gratis (Trial)' },
                              { label: 'Fecha registro', value: fmtFecha(detalleEmpresa.fechaRegistro) },
                              { label: 'Estado suscripción', value: detalleEmpresa.estadoSuscripcion?.toUpperCase() ?? '—' },
                              { label: 'Teléfono', value: detalleEmpresa.telefono ?? '—' },
                            ].map(f => (
                              <div key={f.label} style={{
                                background: C.bg, borderRadius: 8, padding: '10px 14px',
                                border: `1px solid ${C.border}`,
                              }}>
                                <div style={{ color: C.txt2, fontSize: 11, marginBottom: 3 }}>{f.label}</div>
                                <div style={{ color: C.txt, fontWeight: 600, fontSize: 14 }}>{f.value}</div>
                              </div>
                            ))}
                          </div>
                          {detalleEmpresa.sector && (() => {
                            const s = SECTORES_EMPRESARIALES.find(x => x.value === detalleEmpresa.sector);
                            return (
                              <div style={{ background: C.bg, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, marginBottom: 14 }}>
                                <div style={{ color: C.txt2, fontSize: 11, marginBottom: 6 }}>Sector empresarial</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <Tag color="blue">{s?.label ?? detalleEmpresa.sector}</Tag>
                                  {s?.addon && (
                                    <Tag color="green">💡 Add-on sugerido: <strong>{s.addon}</strong></Tag>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Acciones */}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                              onClick={() => { setDetalleEmpresa(null); setModalPlan(detalleEmpresa); setPlanSel(detalleEmpresa.plan ?? 'profesional'); setMeses(1); }}
                              style={{ ...btnStyle(C.purple, false, true), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Edit2 size={14} /> Cambiar plan
                            </button>
                            <button
                              onClick={() => { setDetalleEmpresa(null); setModalMsg(detalleEmpresa); }}
                              style={{ ...btnStyle(C.gold, false, true), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Send size={14} /> Enviar mensaje
                            </button>
                            {detalleEmpresa.isActive
                              ? <Popconfirm title="¿Suspender esta empresa?" okText="Sí" cancelText="No"
                                  onConfirm={() => { suspenderMut.mutate(detalleEmpresa.id); setDetalleEmpresa(null); }}>
                                  <button style={{ ...btnStyle(C.red, false, true), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <PauseCircle size={14} /> Suspender
                                  </button>
                                </Popconfirm>
                              : <button onClick={() => { activarMut.mutate(detalleEmpresa.id); setDetalleEmpresa(null); }}
                                  style={{ ...btnStyle(C.green, false, true), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <PlayCircle size={14} /> Activar
                                </button>
                            }
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'modulos',
                      label: '🧩 Módulos Add-on',
                      children: (
                        <div style={{ paddingTop: 16 }}>
                          <ModulosEmpresaPanel empresaId={detalleEmpresa.id} />
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ── MODAL CAMBIAR PLAN ────────────────────────────────────────────────── */}
      <Modal
        open={!!modalPlan}
        onCancel={() => setModalPlan(null)}
        title={<span style={{ color: C.txt }}>✏️ Cambiar Plan — {modalPlan?.nombre}</span>}
        onOk={() => modalPlan && planMut.mutate({ id: modalPlan.id, plan: planSel, meses })}
        confirmLoading={planMut.isPending}
        okText="Actualizar Plan"
        styles={{ content: { background: C.card }, header: { background: C.card, borderBottom: `1px solid ${C.border}` }, footer: { background: C.card, borderTop: `1px solid ${C.border}` } }}
        centered
      >
        <div style={{ paddingTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: C.txt2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>PLAN</label>
            <Select
              value={planSel} onChange={setPlanSel}
              style={{ width: '100%' }}
              options={PLANES_ACTIVOS.map(p => ({
                value: p.value,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: p.color, fontWeight: 700 }}>{p.label}</span>
                    <span style={{ color: C.gold, fontWeight: 700 }}>US${p.mrrUsd}/mes</span>
                  </div>
                ),
              }))}
            />
          </div>
          <div>
            <label style={{ color: C.txt2, fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
              MESES A ACTIVAR
            </label>
            <InputNumber
              min={1} max={24} value={meses}
              onChange={v => setMeses(v ?? 1)}
              style={{ width: '100%' }}
              addonAfter="meses"
            />
          </div>
          {planSel !== 'trial' && (
            <div style={{
              marginTop: 16, background: `${C.gold}11`,
              border: `1px solid ${C.gold}33`, borderRadius: 8, padding: '12px 14px',
            }}>
              <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>
                Total: {fmtUsd((PLAN_MRR_USD[planSel] ?? 0) * meses)}
              </div>
              <div style={{ color: C.txt2, fontSize: 12 }}>
                {meses} mes{meses > 1 ? 'es' : ''} × {fmtUsd(PLAN_MRR_USD[planSel] ?? 0)}/mes
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── MODAL ENVIAR MENSAJE ──────────────────────────────────────────────── */}
      <Modal
        open={!!modalMsg}
        onCancel={() => { setModalMsg(null); formMsg.resetFields(); }}
        title={<span style={{ color: C.txt }}>📧 Enviar Mensaje — {modalMsg?.nombre}</span>}
        onOk={() => formMsg.validateFields().then(v => msgMut.mutate({ id: modalMsg.id, ...v }))}
        confirmLoading={msgMut.isPending}
        okText="Enviar Mensaje"
        styles={{ content: { background: C.card }, header: { background: C.card, borderBottom: `1px solid ${C.border}` }, footer: { background: C.card, borderTop: `1px solid ${C.border}` } }}
        centered
        width={520}
      >
        <Form form={formMsg} layout="vertical" style={{ paddingTop: 16 }}>
          <Form.Item name="tipo" label={<span style={{ color: C.txt2 }}>Tipo de mensaje</span>}
            rules={[{ required: true, message: 'Selecciona el tipo' }]} initialValue="INFO">
            <Select options={[
              { value: 'INFO',          label: 'ℹ️ Información' },
              { value: 'ALERTA',        label: '⚠️ Alerta' },
              { value: 'PROMOCION',     label: '🎁 Promoción' },
              { value: 'MANTENIMIENTO', label: '🔧 Mantenimiento' },
            ]} />
          </Form.Item>
          <Form.Item name="subject" label={<span style={{ color: C.txt2 }}>Asunto</span>}
            rules={[{ required: true, message: 'El asunto es requerido' }]}>
            <Input placeholder="Ej: Actualización de sistema" />
          </Form.Item>
          <Form.Item name="mensaje" label={<span style={{ color: C.txt2 }}>Mensaje</span>}
            rules={[{ required: true, message: 'El mensaje es requerido' }]}>
            <Input.TextArea rows={4} placeholder="Escribe el mensaje para esta empresa..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal cambiar rol ─────────────────────────────────────────────── */}
      <Modal
        open={!!rolModal}
        title={`⚙ Cambiar rol — ${rolModal?.nombre ?? ''}`}
        onCancel={() => setRolModal(null)}
        onOk={() => rolModal && cambiarRolMut.mutate({ id: rolModal.id, rol: nuevoRol })}
        okText="Guardar cambio"
        okButtonProps={{ loading: cambiarRolMut.isPending, disabled: nuevoRol === rolModal?.role }}
        cancelText="Cancelar"
      >
        {rolModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: C.txt2, fontSize: 13 }}>Rol actual:</span>
              <span style={{
                background: rolModal.role === 'super_admin' ? `${C.gold}20` : `${C.blue}20`,
                color:      rolModal.role === 'super_admin' ? C.gold : C.blue,
                border:     `1px solid ${rolModal.role === 'super_admin' ? `${C.gold}55` : `${C.blue}55`}`,
                borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                {rolModal.role === 'super_admin' ? '★ SUPER ADMIN' : rolModal.role}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: C.txt, marginBottom: 6, fontWeight: 500 }}>Nuevo rol *</div>
              <Select value={nuevoRol} onChange={setNuevoRol} style={{ width: '100%' }}
                options={[
                  { value: 'viewer',      label: 'Viewer — Solo lectura' },
                  { value: 'vendedor',    label: 'Vendedor — POS y ventas' },
                  { value: 'contador',    label: 'Contador — Contabilidad y reportes' },
                  { value: 'admin',       label: 'Admin — Administrador completo' },
                  { value: 'super_admin', label: '★ Super Admin — Control total' },
                ]}
              />
            </div>
            {nuevoRol === 'super_admin' && (
              <div style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}44`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.gold }}>
                ⚠️ Super Admin tiene acceso total al sistema y a todas las empresas.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal HARD DELETE usuario ───────────────────────────────────── */}
      <Modal
        title={<span style={{ color: '#DC2626' }}>💀 Eliminar usuario PERMANENTEMENTE</span>}
        open={!!hardDeleteUsu}
        onCancel={() => { setHardDeleteUsu(null); setConfirmHardUsu(''); }}
        onOk={() => hardDeleteUsu && hardDeleteUsuMut.mutate({ id: hardDeleteUsu.id, confirmacion: confirmHardUsu })}
        okText="Eliminar permanentemente"
        okButtonProps={{ danger: true, loading: hardDeleteUsuMut.isPending, disabled: confirmHardUsu !== 'ELIMINAR_PERMANENTE' }}
        cancelText="Cancelar"
        width={500}
        destroyOnClose
      >
        {hardDeleteUsu && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🚨 Esta acción es IRREVERSIBLE</div>
              <div style={{ color: C.red, fontSize: 12, opacity: 0.8 }}>
                El usuario y todos sus datos se eliminarán físicamente de la base de datos. No se puede deshacer.
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.txt }}>
              Usuario: <strong>{hardDeleteUsu.nombre}</strong> ({hardDeleteUsu.email})
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 6, color: C.txt2 }}>
                Escribe <strong>ELIMINAR_PERMANENTE</strong> para confirmar:
              </div>
              <Input
                value={confirmHardUsu}
                onChange={e => setConfirmHardUsu(e.target.value)}
                placeholder="ELIMINAR_PERMANENTE"
                style={{ borderColor: confirmHardUsu === 'ELIMINAR_PERMANENTE' ? '#16A34A' : undefined }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal HARD DELETE empresa ────────────────────────────────────── */}
      <Modal
        title={<span style={{ color: '#DC2626' }}>💀 Eliminar empresa PERMANENTEMENTE</span>}
        open={!!hardDeleteEmp}
        onCancel={() => { setHardDeleteEmp(null); setConfirmHardEmp(''); }}
        onOk={() => hardDeleteEmp && hardDeleteEmpMut.mutate({ id: hardDeleteEmp.id, confirmacion: confirmHardEmp })}
        okText="Eliminar permanentemente"
        okButtonProps={{ danger: true, loading: hardDeleteEmpMut.isPending, disabled: confirmHardEmp !== 'ELIMINAR_PERMANENTE' }}
        cancelText="Cancelar"
        width={500}
        destroyOnClose
      >
        {hardDeleteEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ color: C.red, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🚨 Esta acción es IRREVERSIBLE</div>
              <div style={{ color: C.red, fontSize: 12, opacity: 0.8 }}>
                La empresa y TODOS sus datos (facturas, clientes, productos, empleados, etc.) se eliminarán permanentemente. No hay recuperación posible.
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.txt }}>
              Empresa: <strong>{hardDeleteEmp.nombre}</strong> (RNC: {hardDeleteEmp.rnc})
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 6, color: C.txt2 }}>
                Escribe <strong>ELIMINAR_PERMANENTE</strong> para confirmar:
              </div>
              <Input
                value={confirmHardEmp}
                onChange={e => setConfirmHardEmp(e.target.value)}
                placeholder="ELIMINAR_PERMANENTE"
                style={{ borderColor: confirmHardEmp === 'ELIMINAR_PERMANENTE' ? '#16A34A' : undefined }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal eliminar usuario ────────────────────────────────────────── */}
      <Modal
        title={<span style={{ color: '#EF4444' }}>⚠️ Eliminar usuario</span>}
        open={!!eliminarModal}
        onCancel={() => setEliminarModal(null)}
        onOk={() => eliminarModal && eliminarUsuarioMut.mutate(eliminarModal.id)}
        okText="Sí, eliminar"
        okButtonProps={{ danger: true, loading: eliminarUsuarioMut.isPending }}
        cancelText="Cancelar"
        width={460}
      >
        {eliminarModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{
              background: `${C.red}15`,
              border: `1px solid ${C.red}44`,
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: C.red,
              fontWeight: 600,
            }}>
              Esta acción no se puede deshacer
            </div>
            <div style={{ fontSize: 13, color: C.txt2 }}>
              ¿Estás seguro que deseas eliminar al usuario:
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.txt }}>
              {eliminarModal.nombre}
              <span style={{ fontWeight: 400, color: C.txt2, marginLeft: 6 }}>
                ({eliminarModal.email})
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.txt2 }}>
              El usuario perderá acceso inmediatamente. Sus datos, facturas
              y registros históricos se mantendrán en el sistema.
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Fijar Vencimiento Manual ──────────────────────────────── */}
      <Modal
        title="Fijar vencimiento manual"
        open={!!modalVence}
        onCancel={() => { setModalVence(null); setVenceFecha(null); setVenceMotivo(''); }}
        onOk={() => {
          if (!modalVence || !venceFecha || !venceMotivo.trim()) {
            message.warning('Selecciona una fecha y escribe un motivo');
            return;
          }
          const fecha = venceFecha.format('YYYY-MM-DD');
          setVenceMut.mutate({ id: modalVence.id, fecha, motivo: venceMotivo.trim() });
        }}
        okText="Guardar"
        okButtonProps={{ loading: setVenceMut.isPending, disabled: !venceFecha || !venceMotivo.trim() }}
        cancelText="Cancelar"
        width={440}
        destroyOnClose
      >
        {modalVence && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ fontSize: 13, color: C.txt }}>
              Empresa: <strong>{modalVence.nombre}</strong>
            </div>
            {modalVence.vencimientoOverride && (
              <div style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}33`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.blue }}>
                Override actual: <strong>{fmtFecha(modalVence.vencimientoOverride)}</strong>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, marginBottom: 6, color: C.txt2 }}>Nueva fecha de vencimiento</div>
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={venceFecha}
                onChange={v => setVenceFecha(v)}
                placeholder="Selecciona fecha"
              />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 6, color: C.txt2 }}>Motivo (obligatorio)</div>
              <Input.TextArea
                rows={3}
                value={venceMotivo}
                onChange={e => setVenceMotivo(e.target.value)}
                placeholder="Ej: Acuerdo comercial especial, período de gracia acordado…"
              />
            </div>
            <div style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}44`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color: C.gold }}>
              Esta fecha tendrá prioridad sobre los pagos y los crons de vencimiento hasta que sea restablecida manualmente.
            </div>
          </div>
        )}
      </Modal>

    </div>
    </ConfigProvider>
    </SaThemeCtx.Provider>
  );
}

// ── Helpers de estilo ────────────────────────────────────────────────────────

function btnStyle(color: string, outline = false, full = false): React.CSSProperties {
  return {
    background:   outline ? `${color}22` : `${color}22`,
    color,
    border:       `1px solid ${color}44`,
    borderRadius: 7,
    padding:      full ? undefined : '5px 8px',
    cursor:       'pointer',
    fontSize:     12,
    fontWeight:   600,
    display:      'inline-flex',
    alignItems:   'center',
    justifyContent: 'center',
    transition:   'all .15s',
    width:        full ? 'auto' : undefined,
  };
}

// ── Tab de Auditoría del Sistema (solo Super Admin) ───────────────────────────

const ACCION_COLOR: Record<string, string> = {
  create: 'green', read: 'default', update: 'blue', delete: 'red',
  login: 'cyan', logout: 'orange', export: 'purple', error: 'red',
};

const RANGOS = [
  { label: 'Hoy',        dias: 0    },
  { label: '7 días',     dias: 7    },
  { label: '30 días',    dias: 30   },
  { label: '90 días',    dias: 90   },
  { label: 'Todo',       dias: null },
];

function AuditoriaTab({ C }: { C: any }) {
  const qc = useQueryClient();
  const [busq,       setBusq]       = useState('');
  const [modulo,     setModulo]     = useState<string | undefined>();
  const [accion,     setAccion]     = useState<string | undefined>();
  const [diasRango,  setDiasRango]  = useState<number | null>(30);
  const [pagAud,     setPagAud]     = useState(1);
  const [detallLog,  setDetallLog]  = useState<any>(null);

  // Fechas calculadas a partir del rango seleccionado
  const { fechaDesde, fechaHasta } = useMemo(() => {
    if (diasRango === null) return { fechaDesde: undefined, fechaHasta: undefined };
    const hoy   = new Date();
    const hasta = hoy.toISOString().split('T')[0];
    if (diasRango === 0) return { fechaDesde: hasta, fechaHasta: hasta };
    const desde = new Date(hoy.getTime() - diasRango * 86400000).toISOString().split('T')[0];
    return { fechaDesde: desde, fechaHasta: hasta };
  }, [diasRango]);

  // Módulos disponibles (dinámico desde la BD)
  const { data: modulosDisp = [] } = useQuery<string[]>({
    queryKey: ['sa-audit-modulos'],
    queryFn:  () => api.get('/auditoria/modulos').then(r => r.data?.data ?? r.data ?? []),
    staleTime: 300_000,
  });

  const { data: logs, isLoading } = useQuery<any>({
    queryKey: ['sa-auditoria', modulo, accion, pagAud, busq, fechaDesde, fechaHasta],
    queryFn:  () => {
      const params = new URLSearchParams({ page: String(pagAud), limit: '50' });
      if (modulo)    params.set('modulo',     modulo);
      if (accion)    params.set('accion',     accion);
      if (busq)      params.set('search',     busq);
      if (fechaDesde)params.set('fechaDesde', fechaDesde!);
      if (fechaHasta)params.set('fechaHasta', fechaHasta!);
      return api.get(`/auditoria?${params}`).then(r => r.data?.data ?? r.data);
    },
    staleTime: 20_000,
  });

  const eventos: any[] = logs?.data ?? logs ?? [];
  const total   = logs?.meta?.total ?? eventos.length;

  const handleExcel = () => {
    const filas = eventos.map((e: any) => ({
      'Fecha':    e.createdAt ? new Date(e.createdAt).toLocaleString('es-DO') : '',
      'Usuario':  e.userName ?? e.userId ?? '—',
      'Rol':      e.userRole ?? '—',
      'Módulo':   e.modulo ?? '—',
      'Acción':   e.accion ?? '—',
      'Descripción': e.descripcion ?? '—',
      'Ruta':     e.ruta ?? '—',
      'Status':   e.statusCode ?? '',
      'IP':       e.ipAddress ?? '—',
      'Éxito':    e.exitoso ? 'Sí' : 'No',
    }));
    import('../../utils/exportExcel').then(({ exportarExcel }) => {
      exportarExcel(filas, `Auditoria-${new Date().toISOString().split('T')[0]}`);
    });
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="Buscar en logs..."
          value={busq}
          onChange={e => { setBusq(e.target.value); setPagAud(1); }}
          allowClear
          style={{ width: 240, background: C.card, borderColor: C.border, color: C.txt }}
          prefix={<Search size={13} style={{ color: C.txt2 }} />}
        />
        {/* Rango de fechas — pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGOS.map(r => {
            const activo = diasRango === r.dias;
            return (
              <button key={String(r.dias)} onClick={() => { setDiasRango(r.dias); setPagAud(1); }} style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', outline: 'none',
                border:     `1px solid ${activo ? C.gold : C.border}`,
                background:  activo ? `${C.gold}22` : 'transparent',
                color:       activo ? C.gold : C.txt2,
                fontWeight:  activo ? 700 : 500,
                transition:  'all .15s',
              }}>{r.label}</button>
            );
          })}
        </div>
        <Select
          allowClear placeholder="Módulo"
          style={{ width: 140 }}
          value={modulo}
          onChange={v => { setModulo(v); setPagAud(1); }}
          options={(modulosDisp as string[]).map(m => ({ value: m, label: m.toUpperCase() }))}
        />
        <Select
          allowClear placeholder="Acción"
          style={{ width: 130 }}
          value={accion}
          onChange={v => { setAccion(v); setPagAud(1); }}
          options={['create','update','delete','login','logout','error','export'].map(a => ({
            value: a, label: <Tag color={ACCION_COLOR[a]} style={{ fontSize: 10 }}>{a}</Tag>,
          }))}
        />
        <span style={{ color: C.txt2, fontSize: 12, marginLeft: 'auto' }}>
          {total.toLocaleString('es-DO')} registros
        </span>
        <button onClick={handleExcel} style={{
          padding: '4px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: 'transparent', color: C.txt2, outline: 'none',
        }}>↓ Excel</button>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['sa-auditoria'] })} style={{
          padding: '4px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: 'transparent', color: C.txt2, outline: 'none',
        }}>⟳</button>
      </div>

      {/* Tabla — solo lectura */}
      <style>{`
        .sa-audit-error > td { background: rgba(239,68,68,0.07) !important; }
        .sa-audit-logout > td { background: rgba(245,158,11,0.06) !important; }
      `}</style>
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <Table
          dataSource={eventos}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 900 }}
          rowClassName={(r: any) =>
            (r.accion === 'error' || !r.exitoso || (r.statusCode && r.statusCode >= 400))
              ? 'sa-audit-error'
              : r.accion === 'logout'
              ? 'sa-audit-logout'
              : ''
          }
          pagination={{
            current: pagAud, pageSize: 50, total,
            onChange: p => setPagAud(p),
            showSizeChanger: false,
            showTotal: t => `${t.toLocaleString('es-DO')} registros`,
            style: { padding: '8px 16px', borderTop: `1px solid ${C.border}` },
          }}
          locale={{ emptyText: isLoading ? 'Cargando...' : 'Sin registros de auditoría para estos filtros' }}
          columns={[
            { title: 'Fecha', dataIndex: 'createdAt', key: 'f', width: 150,
              render: (v: any) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.txt2 }}>
                {v ? new Date(v).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </span> },
            { title: 'Usuario', dataIndex: 'userName', key: 'u', width: 140,
              render: (v: any, r: any) => (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.txt }}>{v ?? '—'}</div>
                  {r.userRole && <div style={{ fontSize: 10, color: C.txt2 }}>{r.userRole}</div>}
                </div>
              )},
            { title: 'Módulo', dataIndex: 'modulo', key: 'm', width: 110,
              render: (v: any) => <Tag style={{ fontSize: 10, textTransform: 'uppercase' }}>{v ?? '—'}</Tag> },
            { title: 'Acción', dataIndex: 'accion', key: 'a', width: 90,
              render: (v: any) => <Tag color={ACCION_COLOR[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag> },
            { title: 'Descripción', dataIndex: 'descripcion', key: 'd', ellipsis: true,
              render: (v: any, r: any) => (
                <Tooltip title={v} placement="topLeft" mouseEnterDelay={0.5}>
                  <span
                    style={{ fontSize: 12, color: (r.accion === 'error' || !r.exitoso) ? C.red : C.txt2, cursor: 'pointer' }}
                    onClick={() => setDetallLog(r)}
                  >
                    {v ?? '—'}
                  </span>
                </Tooltip>
              )},
            { title: 'IP', dataIndex: 'ipAddress', key: 'ip', width: 120,
              render: (v: any) => <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.txt2 }}>{v ?? '—'}</span> },
            { title: 'Status', dataIndex: 'statusCode', key: 's', width: 70, align: 'center' as const,
              render: (v: any, r: any) => (
                <span style={{ fontSize: 11, fontWeight: 600, color: r.exitoso ? C.green : C.red }}>
                  {v ?? '—'}
                </span>
              )},
            { title: '', key: '_ver', width: 40, fixed: 'right' as const,
              render: (_: any, r: any) => (
                <Tooltip title="Ver detalle">
                  <button
                    onClick={() => setDetallLog(r)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      color: (r.accion === 'error' || !r.exitoso) ? C.red : C.txt2,
                      borderRadius: 4, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Eye size={14} />
                  </button>
                </Tooltip>
              )},
          ]}
        />
      </div>
      <div style={{ fontSize: 11, color: C.txt2, marginTop: 6, textAlign: 'right' }}>
        🔒 Solo lectura — los registros de auditoría no pueden modificarse ni eliminarse
      </div>

      {/* Modal de detalle */}
      {detallLog && (() => {
        const r = detallLog;
        const isErr = r.accion === 'error' || !r.exitoso || (r.statusCode && r.statusCode >= 400);
        const tecnico: Record<string, any> = {};
        if (r.ruta)           tecnico.ruta        = r.ruta;
        if (r.metodo)         tecnico.metodo      = r.metodo;
        if (r.statusCode)     tecnico.statusCode  = r.statusCode;
        if (r.duracionMs)     tecnico.duracionMs  = `${r.duracionMs} ms`;
        if (r.userAgent)      tecnico.userAgent   = r.userAgent;
        if (r.entidad)        tecnico.entidad     = r.entidad;
        if (r.entidadId)      tecnico.entidadId   = r.entidadId;
        if (r.userId)         tecnico.userId      = r.userId;
        if (r.userRole)       tecnico.userRole    = r.userRole;
        if (r.empresaId)      tecnico.empresaId   = r.empresaId;
        if (r.valorAnterior) {
          try { tecnico.valorAnterior = JSON.parse(r.valorAnterior); }
          catch { tecnico.valorAnterior = r.valorAnterior; }
        }
        if (r.valorNuevo) {
          try { tecnico.valorNuevo = JSON.parse(r.valorNuevo); }
          catch { tecnico.valorNuevo = r.valorNuevo; }
        }
        const jsonStr = JSON.stringify(tecnico, null, 2);
        const hasTecnico = Object.keys(tecnico).length > 0;

        const lbl: React.CSSProperties = {
          fontSize: 10, fontWeight: 700, color: C.txt2,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          display: 'block', marginBottom: 3,
        };
        const val: React.CSSProperties = {
          fontSize: 13, color: C.txt, display: 'block', marginBottom: 10,
        };
        const sec: React.CSSProperties = {
          background: C.bg, borderRadius: 8, padding: '12px 16px',
          border: `1px solid ${C.border}`, marginBottom: 12,
        };

        return (
          <Modal
            open
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.txt }}>
                <span style={{ fontSize: 18 }}>{isErr ? '❌' : '📋'}</span>
                <span>Detalle del Evento</span>
                {isErr && <Tag color="error" style={{ fontWeight: 600 }}>ERROR</Tag>}
              </span>
            }
            onCancel={() => setDetallLog(null)}
            footer={null}
            width={660}
            destroyOnClose
          >
            <div style={sec}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div>
                  <span style={lbl}>Fecha</span>
                  <span style={{ ...val, fontFamily: 'monospace', fontSize: 12 }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString('es-DO') : '—'}
                  </span>
                </div>
                <div>
                  <span style={lbl}>IP</span>
                  <span style={{ ...val, fontFamily: 'monospace' }}>{r.ipAddress ?? '—'}</span>
                </div>
                <div>
                  <span style={lbl}>Usuario</span>
                  <span style={val}>
                    {r.userName ?? <em style={{ color: C.txt2 }}>no autenticado</em>}
                    {r.userRole && <span style={{ fontSize: 10, color: C.txt2, marginLeft: 6 }}>({r.userRole})</span>}
                  </span>
                </div>
                <div>
                  <span style={lbl}>HTTP Status</span>
                  <span style={{ ...val, fontWeight: 700, color: r.statusCode >= 400 ? C.red : C.green }}>
                    {r.statusCode ?? '—'}
                  </span>
                </div>
                <div>
                  <span style={lbl}>Módulo</span>
                  <div style={{ marginBottom: 10 }}>
                    <Tag style={{ fontSize: 10, textTransform: 'uppercase' }}>{r.modulo}</Tag>
                  </div>
                </div>
                <div>
                  <span style={lbl}>Acción</span>
                  <div style={{ marginBottom: 10 }}>
                    <Tag color={ACCION_COLOR[r.accion] ?? 'default'} style={{ fontSize: 10 }}>{r.accion}</Tag>
                  </div>
                </div>
                {(r.ruta || r.metodo) && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={lbl}>Endpoint</span>
                    <span style={{ ...val, fontFamily: 'monospace', fontSize: 12 }}>
                      {r.metodo && <Tag style={{ marginRight: 6, fontFamily: 'monospace', fontSize: 10 }}>{r.metodo}</Tag>}
                      {r.ruta}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div style={sec}>
              <span style={lbl}>Descripción</span>
              <span style={{ display: 'block', fontSize: 13, lineHeight: 1.7,
                color: isErr ? C.red : C.txt, whiteSpace: 'pre-wrap' }}>
                {r.descripcion}
              </span>
            </div>

            {hasTecnico && (
              <div style={{ ...sec, marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={lbl}>Detalle técnico (JSON)</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(jsonStr); message.success('JSON copiado'); }}
                    style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${C.border}`, background: 'transparent', color: C.txt2, outline: 'none',
                    }}
                  >
                    Copiar JSON
                  </button>
                </div>
                <pre style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '10px 14px', fontSize: 11.5, lineHeight: 1.65, margin: 0,
                  maxHeight: 300, overflowY: 'auto',
                  fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace",
                  color: C.txt, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {jsonStr}
                </pre>
              </div>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}
