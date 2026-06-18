import { useState } from 'react';
import { Button, Modal, Form, Input, Select, message, Typography, Space } from 'antd';
import { LockOutlined, SendOutlined, LogoutOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { suscripcionesApi } from '../../api/suscripciones.api';

const { Title, Text } = Typography;

const PLANES_OPCIONES = [
  { value: 'emprendedor', label: 'EMPRENDEDOR — US$29/mes (RD$125K/mes, 2 usuarios)' },
  { value: 'pyme',        label: 'PYME — US$59/mes (RD$500K/mes, 3 usuarios)' },
  { value: 'pro',         label: 'PRO — US$89/mes (RD$1.25M/mes, 4 usuarios)' },
  { value: 'plus',        label: 'PLUS — US$129/mes (RD$6.25M/mes, 10 usuarios)' },
];

interface SuspensionScreenProps {
  planActual?: string;
  fechaVencimiento?: string;
}

export default function SuspensionScreen({ planActual = 'emprendedor', fechaVencimiento }: SuspensionScreenProps) {
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
    ? new Date(fechaVencimiento).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'fecha desconocida';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 100%)',
      padding: '24px',
    }}>
      <div style={{
        maxWidth: 520, width: '100%',
        background: '#1E293B', borderRadius: 20,
        padding: '48px 40px', textAlign: 'center',
        border: '1px solid #334155',
        boxShadow: '0 24px 64px rgba(0,0,0,.5)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(239,68,68,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
        }}>
          <LockOutlined style={{ fontSize: 32, color: '#EF4444' }} />
        </div>

        <Title level={3} style={{ color: '#F8FAFC', marginBottom: 8 }}>
          Tu período de prueba ha vencido
        </Title>
        <Text style={{ color: '#94A3B8', display: 'block', marginBottom: 24, fontSize: 15, lineHeight: 1.6 }}>
          Tu prueba del plan <strong style={{ color: '#F8FAFC' }}>{planNombre}</strong> venció el{' '}
          <strong style={{ color: '#F8FAFC' }}>{fechaStr}</strong>.
          Para continuar usando HiCloud ERP, solicita la activación de tu licencia.
        </Text>

        {enviado || tienePendiente ? (
          <div style={{
            background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 20,
          }}>
            <Text style={{ color: '#10B981', fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 8 }}>
              ✅ Solicitud enviada exitosamente
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14 }}>
              Un asesor de HiCloud te contactará en menos de 24 horas para coordinar el pago y activar tu plan.
              Tus datos están seguros y conservados.
            </Text>
            <Text style={{ color: '#64748B', fontSize: 13, display: 'block', marginTop: 12 }}>
              ¿Tienes urgencia? Escríbenos a{' '}
              <a href="mailto:soporte@hicloudrd.com" style={{ color: '#60A5FA' }}>soporte@hicloudrd.com</a>
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

        <Text style={{ color: '#475569', fontSize: 12 }}>
          Un asesor te contactará en menos de 24 horas
        </Text>

        <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.href = '/login'; }}
            style={{ color: '#94a3b8', fontSize: 13 }}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>

      {/* Modal de solicitud */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={<span style={{ color: '#F8FAFC' }}>Solicitar activación de licencia</span>}
        footer={null}
        styles={{ content: { background: '#1E293B', border: '1px solid #334155' }, header: { background: '#1E293B', borderBottom: '1px solid #334155' } }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ planSolicitado: planActual, modalidad: 'mensual' }}
          onFinish={(vals) => solicitarMut.mutate(vals)}>
          <Form.Item name="planSolicitado" label={<span style={{ color: '#94A3B8' }}>Plan deseado</span>}>
            <Select size="large" options={PLANES_OPCIONES} />
          </Form.Item>
          <Form.Item name="modalidad" label={<span style={{ color: '#94A3B8' }}>Modalidad de pago</span>}>
            <Select size="large" options={[
              { value: 'mensual', label: 'Mensual' },
              { value: 'anual',   label: 'Anual (10% de descuento)' },
            ]} />
          </Form.Item>
          <Form.Item name="comentario" label={<span style={{ color: '#94A3B8' }}>Comentario (opcional)</span>}>
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
