import { useState } from 'react';
import { Button, Modal, message, Progress, Tag, Divider, Input } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { useAuthStore } from '../../store/auth.store';
import api from '../../api/client';
import { fmtDop } from '../../utils/fmt';

// ── Planes en DOP ─────────────────────────────────────────────────────────────

const PLANES = [
  {
    clave: 'emprendedor',
    nombre: 'EMPRENDEDOR',
    precioMensual: 1700,
    precioAnual: 1530,       // 1700 * 0.90
    limiteDop: 125_000,
    usuarios: 2,
    destacado: false,
    color: '#374151',
    features: [
      'Factura electrónica e-CF DGII gratuita',
      'Ingresos hasta RD$125,000.00 / MES',
      '2 Usuarios con acceso',
      'Soporte 24/7 gratis',
    ],
  },
  {
    clave: 'pyme',
    nombre: 'PYME',
    precioMensual: 3500,
    precioAnual: 3150,       // 3500 * 0.90
    limiteDop: 500_000,
    usuarios: 3,
    destacado: false,
    color: '#047857',
    features: [
      'Factura electrónica e-CF DGII gratuita',
      'Ingresos hasta RD$500,000.00 / MES',
      '3 Usuarios con acceso',
      'Soporte 24/7 gratis',
    ],
  },
  {
    clave: 'pro',
    nombre: 'PRO',
    precioMensual: 5200,
    precioAnual: 4680,       // 5200 * 0.90
    limiteDop: 1_250_000,
    usuarios: 4,
    destacado: true,
    color: '#0d9488',
    features: [
      'Factura electrónica e-CF DGII gratuita',
      'Ingresos hasta RD$1,250,000.00 / MES',
      '4 Usuarios con acceso',
      'Soporte 24/7 gratis',
    ],
  },
  {
    clave: 'plus',
    nombre: 'PLUS',
    precioMensual: 7600,
    precioAnual: 6840,       // 7600 * 0.90
    limiteDop: 6_250_000,
    usuarios: 10,
    destacado: false,
    color: '#374151',
    features: [
      'Factura electrónica e-CF DGII gratuita',
      'Ingresos hasta RD$6,250,000.00 / MES',
      '10 Usuarios con acceso',
      'Soporte 24/7 gratis',
    ],
  },
];

// ── Tabla comparativa ─────────────────────────────────────────────────────────

const TABLA_COMPARATIVA = [
  { feature: 'Factura electrónica e-CF DGII gratuita', emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Ingresos máx/mes',                emprendedor: 'RD$125K', pyme: 'RD$500K', pro: 'RD$1.25M', plus: 'RD$6.25M' },
  { feature: 'Usuarios incluidos',              emprendedor: '2', pyme: '3', pro: '4', plus: '10' },
  { feature: 'Cotizaciones',                    emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Compras y proveedores',           emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Inventario completo',             emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Contabilidad General',            emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'CxC / CxP',                      emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Nómina y RRHH',                   emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'CRM / Proyectos',                 emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Reportes DGII (606/607)',         emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Multi-sucursal',                  emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Soporte 24/7',                    emprendedor: '✓', pyme: '✓', pro: '✓', plus: '✓' },
  { feature: 'Asistente IA',                    emprendedor: '—', pyme: '—', pro: '—', plus: '✓' },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function PlanesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { plan: planActual, suscripcion } = usePlan();
  const { empresaActual } = useAuthStore();

  const [anual, setAnual]           = useState(false);
  const [expandirTabla, setExpandir] = useState(false);
  const [modalPlan, setModalPlan]    = useState<typeof PLANES[0] | null>(null);
  const [comentario, setComentario]  = useState('');

  // Limites actuales
  const { data: limites } = useQuery({
    queryKey: ['mis-limites', empresaActual],
    queryFn:  () => api.get('/suscripciones/mis-limites').then(r => r.data?.data ?? r.data),
    staleTime: 30_000,
  });

  // Solicitud pendiente
  const { data: solicitudActual } = useQuery({
    queryKey: ['mi-solicitud', empresaActual],
    queryFn:  () => api.get('/suscripciones/mi-solicitud').then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  // Solicitar cambio (NO activa directamente — va al super admin para aprobación)
  const solicitarMut = useMutation({
    mutationFn: ({ planSolicitado, modalidad, comentario }: any) =>
      api.post('/suscripciones/solicitar-cambio', { planSolicitado, modalidad, comentario }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mi-solicitud'] });
      setModalPlan(null);
      setComentario('');
      message.success('¡Solicitud enviada! Un asesor te contactará en menos de 24 horas para coordinar el pago y activación.', 6);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.friendlyMessage ?? 'Error al enviar solicitud'),
  });

  const meses = anual ? 12 : 1;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '32px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: '#111827', margin: '0 0 10px' }}>
            Impulsa tu pyme con tu plan de{' '}
            <span style={{ color: '#0d9488' }}>HiCloud ERP</span>
            {' '}desde RD$1,700/mes
          </h1>
          <p style={{ color: '#6b7280', fontSize: 15, margin: '0 0 24px' }}>
            Gestiona tu contabilidad cumpliendo con DGII desde RD$1,700/mes.
            Prueba gratis 15 días, sin tarjeta de crédito ni contratos.
          </p>

          {/* Toggle mensual / anual */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 16px',
          }}>
            <button
              onClick={() => setAnual(false)}
              style={{
                background: !anual ? '#111827' : 'transparent',
                color: !anual ? '#fff' : '#6b7280',
                border: 'none', borderRadius: 7, padding: '6px 16px',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
              Paga mensualmente
            </button>
            <button
              onClick={() => setAnual(true)}
              style={{
                background: anual ? '#111827' : 'transparent',
                color: anual ? '#fff' : '#6b7280',
                border: 'none', borderRadius: 7, padding: '6px 16px',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              Paga anualmente
              <span style={{
                background: '#374151', color: '#fff',
                fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
              }}>10% OFF</span>
            </button>
          </div>
        </div>

        {/* ── Panel "Mi Plan" — uso actual ─────────────────────────────────── */}
        {(limites?.ingresos || limites?.usuarios || suscripcion) && (
          <div style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: '20px 24px', marginBottom: 28,
          }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  Mi Plan Actual
                </span>
                {limites?.planNombre && (
                  <Tag color="teal" style={{ marginLeft: 10, fontWeight: 700, letterSpacing: '0.03em' }}>
                    {(limites.planNombre as string).toUpperCase()}
                  </Tag>
                )}
                {suscripcion?.diasRestantes !== undefined && suscripcion.diasRestantes <= 30 && (
                  <Tag color={suscripcion.diasRestantes <= 7 ? 'red' : 'orange'} style={{ marginLeft: 6, fontSize: 11 }}>
                    Vence en {suscripcion.diasRestantes}d
                  </Tag>
                )}
              </div>
              <Button size="small" onClick={() => navigate('/suscripcion/planes')}>
                Ver planes disponibles
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {/* Barra de ingresos */}
              {limites?.ingresos && limites.ingresos.limite !== -1 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>Ingresos este mes</span>
                    {limites.ingresos.alerta80 && (
                      <span style={{ color: limites.ingresos.alerta95 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                        {limites.ingresos.alerta95 ? '⚠️ Casi al límite' : '⚡ Cerca del límite'}
                      </span>
                    )}
                  </div>
                  <Progress
                    percent={Math.min(limites.ingresos.porcentaje ?? 0, 100)}
                    strokeColor={limites.ingresos.alerta95 ? '#ef4444' : limites.ingresos.alerta80 ? '#f59e0b' : '#0d9488'}
                    trailColor="#e5e7eb" showInfo={false}
                    style={{ marginBottom: 4 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
                    <span>{fmtDop(limites.ingresos.ingresosMes ?? 0)} facturado</span>
                    <span>{fmtDop(limites.ingresos.limite)} límite</span>
                  </div>
                </div>
              )}

              {/* Barra de usuarios */}
              {limites?.usuarios && limites.usuarios.limite !== -1 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>Usuarios activos</span>
                    {limites.usuarios.usado >= limites.usuarios.limite && (
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>⚠️ Límite alcanzado</span>
                    )}
                  </div>
                  <Progress
                    percent={Math.min(Math.round(((limites.usuarios.usado ?? 0) / Math.max(1, limites.usuarios.limite)) * 100), 100)}
                    strokeColor={limites.usuarios.usado >= limites.usuarios.limite ? '#ef4444' : '#3b82f6'}
                    trailColor="#e5e7eb" showInfo={false}
                    style={{ marginBottom: 4 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
                    <span>{limites.usuarios.usado ?? 0} de {limites.usuarios.limite} usuarios</span>
                    {limites.usuarios.usado >= limites.usuarios.limite && (
                      <span style={{ color: '#6b7280', fontSize: 11 }}>Invita a tu equipo con un plan superior</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cards de planes */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}>
          {PLANES.map(plan => {
            const esActual  = planActual === plan.clave;
            const precio    = anual ? plan.precioAnual : plan.precioMensual;

            return (
              <div key={plan.clave} style={{
                background: '#fff',
                border: plan.destacado ? `2px solid ${plan.color}` : '2px solid #e5e7eb',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: plan.destacado ? `0 0 0 4px ${plan.color}22` : 'none',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Nombre del plan */}
                <div style={{
                  background: plan.destacado ? plan.color : '#fff',
                  padding: '16px 20px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800, letterSpacing: '0.04em',
                    color: plan.destacado ? '#fff' : '#374151',
                  }}>
                    {plan.nombre}
                  </div>
                </div>

                <div style={{ padding: '20px 20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Precio */}
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>
                      {fmtDop(precio)}
                    </div>
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>
                      {anual ? 'Mensual (pago anual)' : 'Mensual'}
                    </div>
                  </div>

                  {/* Estado de solicitud pendiente */}
                  {solicitudActual?.estado === 'pendiente' && solicitudActual?.planSolicitado === plan.clave && (
                    <Tag color="orange" style={{ marginBottom: 8, display: 'block', textAlign: 'center' }}>
                      ⏳ Solicitud pendiente de aprobación
                    </Tag>
                  )}

                  {/* Botón CTA — solicitar, no activar directamente */}
                  <Button
                    type={plan.destacado ? 'primary' : 'default'}
                    block size="large"
                    disabled={esActual || solicitudActual?.estado === 'pendiente'}
                    onClick={() => setModalPlan(plan)}
                    style={
                      esActual ? { background: '#f3f4f6', border: '1px solid #d1d5db', color: '#9ca3af', cursor: 'default' }
                      : plan.destacado ? { background: plan.color, borderColor: plan.color, fontWeight: 700, height: 44 }
                      : { borderColor: '#d1d5db', color: '#374151', fontWeight: 600, height: 44 }
                    }
                  >
                    {esActual ? '✓ Plan actual' : 'Solicitar upgrade'}
                  </Button>

                  <Divider style={{ margin: '16px 0' }} />

                  {/* Features */}
                  <div style={{ flex: 1 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10,
                      }}>
                        <Check size={16} color="#0d9488" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Botón compara planes */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Button
            size="large"
            onClick={() => setExpandir(!expandirTabla)}
            style={{
              background: '#0d9488', color: '#fff', border: 'none',
              fontWeight: 700, borderRadius: 8, padding: '0 32px', height: 46,
            }}
            icon={expandirTabla ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          >
            Compara nuestros planes
          </Button>
        </div>

        {/* Tabla comparativa */}
        {expandirTabla && (
          <div style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            overflow: 'hidden', marginBottom: 32,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
                    Característica
                  </th>
                  {PLANES.map(p => (
                    <th key={p.clave} style={{
                      padding: '12px 16px', textAlign: 'center', fontSize: 13,
                      color: p.destacado ? p.color : '#374151', fontWeight: 800,
                    }}>
                      {p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLA_COMPARATIVA.map((row, i) => (
                  <tr key={row.feature} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#374151' }}>{row.feature}</td>
                    {['emprendedor', 'pyme', 'pro', 'plus'].map(p => (
                      <td key={p} style={{
                        padding: '11px 16px', textAlign: 'center', fontSize: 13,
                        color: (row as any)[p] === '✓' ? '#0d9488' : (row as any)[p] === '—' ? '#d1d5db' : '#374151',
                        fontWeight: (row as any)[p] === '✓' ? 700 : 400,
                      }}>
                        {(row as any)[p]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Nota al pie */}
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
          Todos los precios en pesos · ITBIS no incluido · Cancela cuando quieras · Sin contratos de permanencia
        </p>
      </div>

      {/* Modal confirmar */}
      {/* Modal solicitar upgrade */}
      <Modal
        open={!!modalPlan}
        onCancel={() => { setModalPlan(null); setComentario(''); }}
        onOk={() => modalPlan && solicitarMut.mutate({ planSolicitado: modalPlan.clave, modalidad: anual ? 'anual' : 'mensual', comentario })}
        confirmLoading={solicitarMut.isPending}
        title="Solicitar actualización de plan"
        okText="Enviar solicitud"
        cancelText="Cancelar"
        centered
      >
        {modalPlan && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ background: `${modalPlan.color}11`, border: `2px solid ${modalPlan.color}44`, borderRadius: 10, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: modalPlan.color }}>{modalPlan.nombre}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 4 }}>
                {fmtDop(anual ? modalPlan.precioAnual : modalPlan.precioMensual)}/mes
                {anual && <span style={{ color: '#0d9488', fontSize: 12, marginLeft: 8 }}>(pago anual, 10% OFF)</span>}
              </div>
              <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                Límite de ingresos: {fmtDop(modalPlan.limiteDop)}/mes · {modalPlan.usuarios} usuario{modalPlan.usuarios > 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: '#374151' }}>
                Comentario (opcional):
              </label>
              <Input.TextArea
                rows={2} placeholder="¿Alguna consulta o requerimiento especial?"
                value={comentario} onChange={e => setComentario(e.target.value)}
              />
            </div>
            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                <strong>¿Cómo funciona?</strong> Tu solicitud será revisada por un asesor de HiCloud.
                Te contactaremos en <strong>menos de 24 horas</strong> para coordinar el pago y activar el nuevo plan.
                El cambio NO es inmediato.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
