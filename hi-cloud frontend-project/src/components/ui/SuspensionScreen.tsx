import { useState } from 'react';
import { Button, Modal, Form, Input, Select, message, Typography, Space } from 'antd';
import { LockOutlined, SendOutlined, LogoutOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suscripcionesApi } from '../../api/suscripciones.api';
import { useThemeStore } from '../../store/theme.store';
import { fecha } from '../../utils/fechaRD';

const WS_NUMBER = '8093081713';
const WS_URL    = `https://wa.me/1${WS_NUMBER}`;

const { Title, Text } = Typography;

const PLANES_OPCIONES = [
  { value: 'emprendedor', label: 'EMPRENDEDOR — RD$1,700/mes (hasta RD$125K ingresos, 2 usuarios)' },
  { value: 'pyme',        label: 'PYME — RD$3,500/mes (hasta RD$500K ingresos, 3 usuarios)' },
  { value: 'pro',         label: 'PRO — RD$5,200/mes (hasta RD$1.25M ingresos, 4 usuarios)' },
  { value: 'plus',        label: 'PLUS — RD$7,600/mes (hasta RD$6.25M ingresos, 10 usuarios)' },
];

interface EmpresaItem {
  empresaId: number;
  nombre:    string;
}

interface SuspensionScreenProps {
  planActual?: string;
  fechaVencimiento?: string;
  motivoSuspension?: string | null;
  /** Lista de todas las empresas del usuario (para mostrar cambio de empresa) */
  misEmpresas?: EmpresaItem[];
  /** Id de la empresa actual suspendida (para excluirla del selector) */
  empresaActualId?: number | null;
  /** Callback para cambiar a otra empresa */
  onCambiarEmpresa?: (empresaId: number) => void;
}

export default function SuspensionScreen({
  planActual = 'emprendedor',
  fechaVencimiento,
  motivoSuspension,
  misEmpresas = [],
  empresaActualId,
  onCambiarEmpresa,
}: SuspensionScreenProps) {
  const isDark = useThemeStore(s => s.isDark);

  const T = isDark
    ? {
        pageBg:        'linear-gradient(135deg,#0F172A 0%,#1E293B 100%)',
        cardBg:        '#1E293B',
        cardBorder:    '#334155',
        cardShadow:    '0 24px 64px rgba(0,0,0,.5)',
        titleColor:    '#F8FAFC',
        textColor:     '#94A3B8',
        textMuted:     '#64748B',
        textFaint:     '#475569',
        iconCircle:    'rgba(239,68,68,.15)',
        strongColor:   '#F8FAFC',
        successBg:     'rgba(16,185,129,.1)',
        successBorder: 'rgba(16,185,129,.3)',
        successText:   '#10B981',
        divider:       'rgba(255,255,255,0.08)',
        sectionBg:     'rgba(255,255,255,0.04)',
        sectionBorder: 'rgba(255,255,255,0.08)',
        popupBg:       '#1E293B',
        logoutColor:   '#94a3b8',
        modalBg:       '#1E293B',
        modalBorder:   '#334155',
        labelColor:    '#94A3B8',
        linkColor:     '#60A5FA',
      }
    : {
        pageBg:        'linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%)',
        cardBg:        '#FFFFFF',
        cardBorder:    '#CBD5E1',
        cardShadow:    '0 24px 64px rgba(0,0,0,.1)',
        titleColor:    '#0F172A',
        textColor:     '#475569',
        textMuted:     '#64748B',
        textFaint:     '#94A3B8',
        iconCircle:    'rgba(239,68,68,.1)',
        strongColor:   '#0F172A',
        successBg:     'rgba(16,185,129,.08)',
        successBorder: 'rgba(16,185,129,.25)',
        successText:   '#059669',
        divider:       'rgba(0,0,0,0.1)',
        sectionBg:     'rgba(0,0,0,0.03)',
        sectionBorder: 'rgba(0,0,0,0.08)',
        popupBg:       '#FFFFFF',
        logoutColor:   '#64748b',
        modalBg:       '#FFFFFF',
        modalBorder:   '#E2E8F0',
        labelColor:    '#475569',
        linkColor:     '#2563EB',
      };

  const [modalOpen, setModalOpen] = useState(false);
  const [enviado,   setEnviado]   = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: solicitudExistente } = useQuery({
    queryKey: ['mi-solicitud'],
    queryFn:  suscripcionesApi.miSolicitud,
    retry: false,
  });
  const tienePendiente = solicitudExistente?.estado === 'pendiente';

  const solicitarMut = useMutation({
    mutationFn: (vals: { planSolicitado: string; modalidad: string; comentario?: string }) =>
      suscripcionesApi.solicitarCambio(vals.planSolicitado, vals.modalidad, vals.comentario),
    onSuccess: () => {
      setEnviado(true);
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ['mi-solicitud'] });
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? 'Error al enviar la solicitud', 5);
    },
  });

  const planNombre = PLANES_OPCIONES.find(p => p.value === planActual)?.label.split(' —')[0] ?? planActual;
  const fechaStr   = fechaVencimiento
    ? fecha(fechaVencimiento)
    : 'fecha desconocida';

  // Textos según el motivo de suspensión
  const esPrueba = motivoSuspension === 'PRUEBA_VENCIDA' || !motivoSuspension;
  const esManual = motivoSuspension === 'SUSPENSION_MANUAL';
  const titulo = esPrueba
    ? 'Tu período de prueba ha vencido'
    : esManual
    ? 'Tu cuenta ha sido suspendida'
    : 'Tu licencia ha vencido';
  const subtexto = esPrueba
    ? <>Tu prueba del plan <strong style={{ color: T.strongColor }}>{planNombre}</strong> venció el{' '}<strong style={{ color: T.strongColor }}>{fechaStr}</strong>. Para continuar usando HiCloud ERP, solicita la activación de tu licencia.</>
    : esManual
    ? <>Tu cuenta fue suspendida por un administrador. Contacta a soporte para más información.</>
    : <>Tu licencia del plan <strong style={{ color: T.strongColor }}>{planNombre}</strong> expiró el{' '}<strong style={{ color: T.strongColor }}>{fechaStr}</strong> y el período de gracia ha concluido. Renueva tu licencia para seguir usando HiCloud ERP.</>;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.pageBg,
      padding: '24px',
    }}>
      <div style={{
        maxWidth: 520, width: '100%',
        background: T.cardBg, borderRadius: 20,
        padding: '48px 40px', textAlign: 'center',
        border: `1px solid ${T.cardBorder}`,
        boxShadow: T.cardShadow,
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: T.iconCircle,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <LockOutlined style={{ fontSize: 32, color: '#EF4444' }} />
        </div>

        <Title level={3} style={{ color: T.titleColor, marginBottom: 8 }}>
          {titulo}
        </Title>
        <Text style={{ color: T.textColor, display: 'block', marginBottom: 24, fontSize: 15, lineHeight: 1.6 }}>
          {subtexto}
        </Text>

        {enviado || tienePendiente ? (
          <div style={{
            background: T.successBg, border: `1px solid ${T.successBorder}`,
            borderRadius: 12, padding: '20px 24px', marginBottom: 20,
          }}>
            <Text style={{ color: T.successText, fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              ✅ Solicitud enviada exitosamente
            </Text>
            <Text style={{ color: T.textColor, fontSize: 14 }}>
              Un asesor de HiCloud te contactará en menos de 24 horas para coordinar el pago y activar tu plan.
              Tus datos están seguros y conservados.
            </Text>
            <Text style={{ color: T.textMuted, fontSize: 13, display: 'block', marginTop: 12 }}>
              ¿Tienes urgencia? Escríbenos a{' '}
              <a href="mailto:soporte@hicloudrd.com" style={{ color: T.linkColor }}>soporte@hicloudrd.com</a>
            </Text>
          </div>
        ) : (
          <Button
            type="primary" size="large" block
            icon={<SendOutlined />}
            onClick={() => setModalOpen(true)}
            style={{
              height: 52, marginBottom: 16,
              background: 'linear-gradient(135deg,#1a56db,#0ea5e9)',
              border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            }}>
            Solicitar activación de licencia
          </Button>
        )}

        <Text style={{ color: T.textFaint, fontSize: 12 }}>
          Un asesor te contactará en menos de 24 horas
        </Text>

        {/* Cambio de empresa — visible si el usuario pertenece a más de una */}
        {misEmpresas.length > 1 && onCambiarEmpresa && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: T.sectionBg, borderRadius: 10, border: `1px solid ${T.sectionBorder}` }}>
            <Text style={{ color: T.textColor, fontSize: 13, display: 'block', marginBottom: 8 }}>
              Cambiar a otra empresa:
            </Text>
            <Select
              size="middle"
              style={{ width: '100%' }}
              placeholder="Selecciona una empresa…"
              onChange={(id: number) => onCambiarEmpresa(id)}
              options={misEmpresas
                .filter(e => e.empresaId !== empresaActualId)
                .map(e => ({ value: e.empresaId, label: e.nombre }))
              }
              styles={{ popup: { root: { background: T.popupBg } } }}
            />
          </div>
        )}

        <div style={{ marginTop: 24, borderTop: `1px solid ${T.divider}`, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* WhatsApp */}
          <a
            href={WS_URL}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#25D366', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>

          <span style={{ color: T.divider, fontSize: 16, lineHeight: 1 }}>|</span>

          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.href = '/login'; }}
            style={{ color: T.logoutColor, fontSize: 13, padding: 0, height: 'auto' }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>

      {/* Modal de solicitud */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={<span style={{ color: T.titleColor }}>Solicitar activación de licencia</span>}
        footer={null}
        styles={{
          content: { background: T.modalBg, border: `1px solid ${T.modalBorder}` },
          header:  { background: T.modalBg, borderBottom: `1px solid ${T.modalBorder}` },
        }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ planSolicitado: planActual, modalidad: 'mensual' }}
          onFinish={(vals) => solicitarMut.mutate(vals)}>
          <Form.Item name="planSolicitado" label={<span style={{ color: T.labelColor }}>Plan deseado</span>}>
            <Select size="large" options={PLANES_OPCIONES} />
          </Form.Item>
          <Form.Item name="modalidad" label={<span style={{ color: T.labelColor }}>Modalidad de pago</span>}>
            <Select size="large" options={[
              { value: 'mensual', label: 'Mensual' },
              { value: 'anual',   label: 'Anual (10% de descuento)' },
            ]} />
          </Form.Item>
          <Form.Item name="comentario" label={<span style={{ color: T.labelColor }}>Comentario (opcional)</span>}>
            <Input.TextArea rows={3} placeholder="Alguna nota adicional para el asesor..." />
          </Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={solicitarMut.isPending}
              style={{ background: 'linear-gradient(135deg,#1a56db,#0ea5e9)', border: 'none' }}>
              Enviar solicitud
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
