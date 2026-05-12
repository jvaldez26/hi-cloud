import { useState } from 'react';
import { Button, Modal, InputNumber, message, Spin } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Crown, Check, X, Zap, ArrowLeft } from 'lucide-react';
import { suscripcionesApi } from '../../api/suscripciones.api';
import { usePlan } from '../../hooks/usePlan';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';

// ── Datos base de planes — nombre/precio se SOBREESCRIBE con datos del backend ──

const PLANES_BASE = [
  {
    clave:    'trial',
    nombre:   'Trial',
    precio:   0,
    precioPeriodo: '30 días gratis',
    badge:    null,
    color:    '#94A3B8',
    maxUsuarios:    2,
    maxFacturasMes: 50,
    maxProductos:   20,
    maxClientes:    20,
    soporte:  'Documentación',
    incluidos: [
      'Dashboard básico',
      'Punto de Venta (POS)',
      'Facturación básica',
      'Clientes (máx. 20)',
      'Productos (máx. 20)',
      'Inventario básico',
      'Caja Diaria',
    ],
    excluidos: [
      'e-CF Electrónico DGII',
      'Compras y Proveedores',
      'Contabilidad',
      'Recursos Humanos / Nómina',
      'Multi-sucursal',
      'Reportes avanzados',
    ],
  },
  {
    clave:    'basico',
    nombre:   'Básico',
    precio:   1500,
    precioPeriodo: '/mes',
    badge:    null,
    color:    '#3B82F6',
    maxUsuarios:    3,
    maxFacturasMes: 200,
    maxProductos:   100,
    maxClientes:    100,
    soporte:  'Email',
    incluidos: [
      'Todo lo del Trial',
      'e-CF E31 y E32 (DGII)',
      'Compras básicas',
      'Proveedores',
      'Caja Diaria',
      'Reportes básicos (ventas/compras)',
      '1 sucursal',
    ],
    excluidos: [
      'Contabilidad General',
      'CxC / CxP avanzado',
      'Recursos Humanos / Nómina',
      'Multi-sucursal',
      'Reportes DGII avanzados',
    ],
  },
  {
    clave:    'profesional',
    nombre:   'Profesional',
    precio:   3500,
    precioPeriodo: '/mes',
    badge:    '⭐ MÁS POPULAR',
    color:    '#8B5CF6',
    maxUsuarios:    10,
    maxFacturasMes: 1000,
    maxProductos:   500,
    maxClientes:    500,
    soporte:  'Email + Chat',
    incluidos: [
      'Todo lo del Básico',
      'Todos los tipos e-CF (E31–E47)',
      'Contabilidad General',
      'CxC y CxP',
      'Reportes DGII (606/607/ITBIS)',
      'Multi-sucursal (hasta 3)',
      'Activos Fijos',
      'Presupuestos',
      'Período Contable',
    ],
    excluidos: [
      'Recursos Humanos / Nómina',
      'CRM / Leads',
      'Proyectos y Servicios',
    ],
  },
  {
    clave:    'empresarial',
    nombre:   'Empresarial',
    precio:   7000,
    precioPeriodo: '/mes',
    badge:    '💎 MEJOR VALOR',
    color:    '#F59E0B',
    maxUsuarios:    25,
    maxFacturasMes: 5000,
    maxProductos:   2000,
    maxClientes:    -1,
    soporte:  'Email + Chat + Teléfono',
    incluidos: [
      'Todo lo del Profesional',
      'Recursos Humanos completo',
      'Nómina con TSS e ISR',
      'Multi-sucursal ilimitadas',
      'CRM / Leads',
      'Proyectos y Servicios',
      'Reportes avanzados con gráficas',
      'Auditoría completa',
      'KPI y Analytics',
    ],
    excluidos: [
      'API Access externo',
      'WhatsApp Business',
    ],
  },
  {
    clave:    'enterprise',
    nombre:   'Enterprise',
    precio:   15000,
    precioPeriodo: '/mes',
    badge:    '🚀 TODO INCLUIDO',
    color:    '#EF4444',
    maxUsuarios:    -1,
    maxFacturasMes: -1,
    maxProductos:   -1,
    maxClientes:    -1,
    soporte:  'Dedicado 24/7',
    incluidos: [
      'TODOS los módulos sin excepción',
      'Usuarios ilimitados',
      'Facturas ilimitadas',
      'API Access completo',
      'WhatsApp Business',
      'Multi-empresa en una cuenta',
      'Onboarding personalizado',
      'Capacitación incluida',
      'SLA 99.9% garantizado',
    ],
    excluidos: [],
  },
];

const fmt = (n: number) => n === -1 ? 'Ilimitado' : n.toLocaleString('es-DO');

/** Jerarquía de planes — debe coincidir con el backend */
const PLAN_TIER: Record<string, number> = {
  trial: 0, basico: 1, profesional: 2, empresarial: 3, enterprise: 4,
};

/** true si el plan destino es inferior al plan actual */
const esDowngrade = (actual: string, destino: string) =>
  (PLAN_TIER[destino] ?? 0) < (PLAN_TIER[actual] ?? 0);

// ── Componente ────────────────────────────────────────────────────────────────

export default function PlanesPage() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { plan: planActual, suscripcion } = usePlan();
  const { empresaActual } = useAuthStore();

  // Cargar precios actualizados desde el backend (refleja cambios del super admin)
  const { data: planesApi } = useQuery({
    queryKey: ['planes-catalogo'],
    queryFn:  () => api.get('/suscripciones/planes').then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  // Fusionar base (UI/logos/features) con precios del backend
  const PLANES = PLANES_BASE.map(p => {
    const apiPlan = (planesApi ?? []).find((a: any) => a.clave === p.clave);
    return {
      ...p,
      nombre:        apiPlan?.nombre ?? p.nombre,
      precio:        apiPlan?.precio ?? p.precio,
      precioPeriodo: (apiPlan?.precio ?? p.precio) === 0 ? '30 días gratis' : '/mes',
    };
  });

  const [modalPlan, setModalPlan] = useState<typeof PLANES_BASE[0] | null>(null);
  const [meses, setMeses]         = useState(1);

  const activarMut = useMutation({
    mutationFn: ({ plan, meses }: { plan: string; meses: number }) =>
      suscripcionesApi.activar(empresaActual!, plan, meses),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mi-plan'] });
      qc.invalidateQueries({ queryKey: ['mis-limites'] });
      setModalPlan(null);
      message.success('¡Plan actualizado exitosamente!');
      navigate('/dashboard');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al cambiar plan'),
  });

  const esActual = (clave: string) => planActual === clave;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      padding: '32px 24px',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 48 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: '#1E293B', border: '1px solid #334155',
              borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
              color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}>
            <ArrowLeft size={15} /> Volver
          </button>
          <div>
            <h1 style={{ color: '#F8FAFC', fontWeight: 900, fontSize: 28, margin: 0 }}>
              Planes de HiCloud ERP
            </h1>
            <p style={{ color: '#94A3B8', margin: '6px 0 0', fontSize: 14 }}>
              Elige el plan que mejor se adapte a tu negocio en República Dominicana
            </p>
          </div>
        </div>

        {/* Plan actual info */}
        {suscripcion && (
          <div style={{
            background: '#1E293B', border: '1px solid #334155', borderRadius: 12,
            padding: '16px 24px', marginBottom: 36,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <Crown size={20} color="#F59E0B" />
            <div>
              <span style={{ color: '#94A3B8', fontSize: 13 }}>Plan actual: </span>
              <span style={{ color: '#F8FAFC', fontWeight: 700, fontSize: 15 }}>
                {suscripcion.info?.nombre ?? planActual.toUpperCase()}
              </span>
            </div>
            {suscripcion.diasRestantes > 0 && (
              <div style={{
                background: suscripcion.diasRestantes <= 7 ? '#EF444422' : '#10B98122',
                border: `1px solid ${suscripcion.diasRestantes <= 7 ? '#EF4444' : '#10B981'}44`,
                borderRadius: 6, padding: '2px 10px',
                color: suscripcion.diasRestantes <= 7 ? '#EF4444' : '#10B981',
                fontSize: 12, fontWeight: 600,
              }}>
                {suscripcion.diasRestantes} días restantes
              </div>
            )}
          </div>
        )}

        {/* Grid de planes */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}>
          {PLANES.map(plan => {
            const actual    = esActual(plan.clave);
            const inferior  = !!planActual && esDowngrade(planActual, plan.clave);
            const color     = plan.color;

            return (
              <div key={plan.clave} style={{
                background: actual ? `${color}0A` : inferior ? '#141A26' : '#1E293B',
                border: `2px solid ${actual ? color : inferior ? '#1E293B' : '#334155'}`,
                borderRadius: 16,
                overflow: 'hidden',
                transition: 'all .2s',
                position: 'relative',
                opacity: inferior ? 0.55 : 1,
              }}>
                {/* Badge */}
                {plan.badge && (
                  <div style={{
                    background: color, color: '#fff',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                    textAlign: 'center', padding: '6px 0',
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan actual badge */}
                {actual && (
                  <div style={{
                    background: `${color}33`, color,
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                    textAlign: 'center', padding: '6px 0',
                  }}>
                    ✓ PLAN ACTUAL
                  </div>
                )}

                <div style={{ padding: '24px 22px' }}>
                  {/* Nombre y precio */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 12,
                    }}>
                      <Zap size={20} color={color} />
                    </div>
                    <h3 style={{ color: '#F8FAFC', fontWeight: 800, fontSize: 18, margin: '0 0 8px' }}>
                      {plan.nombre}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ color, fontWeight: 900, fontSize: 32 }}>
                        {plan.precio === 0 ? 'Gratis' : `RD$${plan.precio.toLocaleString('es-DO')}`}
                      </span>
                      {plan.precio > 0 && (
                        <span style={{ color: '#64748B', fontSize: 14 }}>{plan.precioPeriodo}</span>
                      )}
                    </div>
                    {plan.precio === 0 && (
                      <span style={{ color: '#64748B', fontSize: 12 }}>30 días de prueba</span>
                    )}
                  </div>

                  {/* Límites */}
                  <div style={{
                    background: '#0F172A', borderRadius: 10, padding: '12px 14px', marginBottom: 20,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Usuarios', value: fmt(plan.maxUsuarios) },
                        { label: 'Facturas/mes', value: fmt(plan.maxFacturasMes) },
                        { label: 'Productos', value: fmt(plan.maxProductos) },
                        { label: 'Clientes', value: fmt(plan.maxClientes) },
                      ].map(l => (
                        <div key={l.label}>
                          <div style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {l.label}
                          </div>
                          <div style={{ color: color === '#94A3B8' ? '#94A3B8' : color, fontWeight: 700, fontSize: 13 }}>
                            {l.value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: '1px solid #1E293B', marginTop: 10, paddingTop: 10 }}>
                      <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>
                        Soporte
                      </span>
                      <div style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>{plan.soporte}</div>
                    </div>
                  </div>

                  {/* Módulos incluidos */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: '#64748B', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
                      Incluye
                    </p>
                    {plan.incluidos.map(m => (
                      <div key={m} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <Check size={14} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: '#CBD5E1', fontSize: 13 }}>{m}</span>
                      </div>
                    ))}
                    {plan.excluidos.map(m => (
                      <div key={m} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <X size={14} color="#475569" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: '#475569', fontSize: 13 }}>{m}</span>
                      </div>
                    ))}
                  </div>

                  {/* Botón */}
                  <Button
                    type={actual ? 'default' : 'primary'}
                    block
                    disabled={actual || plan.clave === 'trial' || inferior}
                    onClick={() => { setModalPlan(plan); setMeses(1); }}
                    style={actual ? {
                      background: '#1E293B', borderColor: color, color,
                      fontWeight: 700, height: 42,
                    } : inferior ? {
                      background: '#0F172A', borderColor: '#1E293B', color: '#334155',
                      height: 42, cursor: 'not-allowed',
                    } : plan.clave === 'trial' ? {
                      background: '#1E293B', borderColor: '#334155', color: '#475569',
                      height: 42,
                    } : {
                      background: color, border: 'none',
                      fontWeight: 700, height: 42,
                    }}>
                    {actual
                      ? '✓ Plan actual'
                      : inferior
                        ? 'Solo el administrador puede bajar de plan'
                        : plan.clave === 'trial'
                          ? 'Solo al registrarse'
                          : `Actualizar a ${plan.nombre}`}
                  </Button>

                  {/* Nota de downgrade */}
                  {inferior && (
                    <p style={{ color: '#475569', fontSize: 11, textAlign: 'center', margin: '8px 0 0' }}>
                      Para bajar al plan {plan.nombre}, contacta al administrador de HiCloud.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Nota al pie */}
        <div style={{ textAlign: 'center', marginTop: 40, color: '#475569', fontSize: 13 }}>
          💡 Todos los precios en pesos dominicanos (RD$) · ITBIS incluido · Cancela cuando quieras
          <br />
          Para soporte Enterprise, contáctanos: <span style={{ color: '#3B82F6' }}>soporte@hicloud.do</span>
        </div>
      </div>

      {/* Modal confirmar plan */}
      <Modal
        open={!!modalPlan}
        onCancel={() => setModalPlan(null)}
        onOk={() => modalPlan && activarMut.mutate({ plan: modalPlan.clave, meses })}
        confirmLoading={activarMut.isPending}
        title={<span style={{ fontSize: 16, fontWeight: 700 }}>Confirmar cambio de plan</span>}
        okText="Confirmar y activar"
        cancelText="Cancelar"
        centered
      >
        {modalPlan && (
          <div style={{ paddingTop: 12 }}>
            <div style={{
              background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 20,
              border: `2px solid ${modalPlan.color}44`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: modalPlan.color }}>
                Plan {modalPlan.nombre}
              </div>
              <div style={{ fontSize: 15, color: '#374151', marginTop: 4 }}>
                {modalPlan.precio === 0
                  ? 'Gratis por 30 días'
                  : `RD$${modalPlan.precio.toLocaleString('es-DO')}/mes`}
              </div>
            </div>

            {modalPlan.precio > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                  Meses a activar:
                </label>
                <InputNumber
                  min={1} max={24} value={meses}
                  onChange={v => setMeses(v ?? 1)}
                  style={{ width: '100%' }}
                  addonAfter="meses"
                />
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  background: '#FEF9EC', border: '1px solid #FDE68A', borderRadius: 8,
                  color: '#92400E', fontSize: 13, fontWeight: 600,
                }}>
                  Total: RD${(modalPlan.precio * meses).toLocaleString('es-DO')}
                  ({meses} mes{meses > 1 ? 'es' : ''})
                </div>
              </div>
            )}

            <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>
              El plan se activará de forma inmediata. Si tienes un plan activo,
              el cambio se aplicará en este momento.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
