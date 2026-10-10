/**
 * Modal de autorización de Modo Supervisor — versión genérica, para CUALQUIER
 * pantalla fuera del POS. El POS mantiene su propio modal (escaneo de
 * tarjeta, cámara, PIN rápido) montado en POSPage.tsx; este es la base que
 * vive en App.tsx, SIEMPRE montada, para que ninguna otra pantalla quede sin
 * forma de responder a un 403 { supervisorClaveRequerida }.
 *
 * Bug real (2026-10-09, empresa 73, Bellamar González): antes de esto, Modo
 * Supervisor "solo existía dentro del POS" — fuera de ahí (Caja Diaria, por
 * ejemplo), el interceptor de Axios no tenía ningún handler registrado y el
 * 403 llegaba desnudo a la pantalla, sin ningún camino para autorizarlo:
 * indistinguible de "no tienes permiso". Ver sessionEvents.ts
 * (pushSupervisorAuthHandler, ahora una pila) y useSupervisor.ts.
 */
import { useState } from 'react';
import { Modal, Select, Input, Button, Avatar, Spin } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { mensajeDeError } from '../../utils/mensajeDeError';
import type { useSupervisor } from '../../hooks/useSupervisor';

export default function SupervisorAuthModal({ supervisor }: { supervisor: ReturnType<typeof useSupervisor> }) {
  const [supId, setSupId]                   = useState<number | undefined>(undefined);
  const [password, setPassword]             = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError]                   = useState('');
  const [verificando, setVerificando]       = useState(false);
  const [blockCountdown, setBlockCountdown] = useState(0);

  const { data: supervisores, isLoading } = useQuery<{ id: number; nombre: string; role: string; tienePin: boolean }[]>({
    queryKey: ['supervisores-pos'],
    queryFn:  () => api.get('/auth/supervisores').then(r => {
      const d = r.data?.data ?? r.data;
      return Array.isArray(d) ? d : [];
    }),
    enabled:   !!supervisor.pendingAction,
    staleTime: 2 * 60_000,
  });
  const seleccionado = supervisores?.find(s => s.id === supId);
  const esPin = !!seleccionado?.tienePin;

  const limpiar = () => {
    setSupId(undefined); setPassword(''); setError(''); setPasswordVisible(false);
    if (blockCountdown > 0) return; // deja correr la cuenta regresiva aunque se cierre el modal
  };

  const startBlockCountdown = (segundos: number) => {
    setBlockCountdown(segundos);
    const id = setInterval(() => {
      setBlockCountdown(v => {
        if (v <= 1) { clearInterval(id); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const verificar = async () => {
    if (blockCountdown > 0) return;
    if (!supId || !password) { setError('Selecciona un supervisor e ingresa su contraseña'); return; }
    setVerificando(true); setError('');
    try {
      const res: any = await api.post('/auth/verificar-supervisor', {
        supervisorId: supId, password,
        action: supervisor.pendingAction?.action,
        detail: supervisor.pendingAction?.detail,
        clave:  supervisor.pendingAction?.clave,
      });
      const d = res.data?.data ?? res.data;
      supervisor.resolveModal(true, d.nombre, d.role, d.sessionId, d.supervisorToken);
      limpiar();
    } catch (e: any) {
      const data = e?.response?.data;
      setError(mensajeDeError(e, {
        errorServidor: 'No pudimos verificar al supervisor, intenta de nuevo en unos segundos.',
        fallback:      'Credenciales inválidas',
      }));
      const remainingSecs = data?.remainingSeconds as number | undefined;
      if (remainingSecs && remainingSecs > 0) startBlockCountdown(remainingSecs);
    } finally { setVerificando(false); }
  };

  return (
    <Modal
      maskClosable={false}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserSwitchOutlined style={{ color: '#F59E0B' }} />
        Autorización de Supervisor
      </span>}
      open={!!supervisor.pendingAction}
      onCancel={() => { supervisor.resolveModal(false); limpiar(); }}
      footer={null}
      width={420}
      destroyOnClose
    >
      {supervisor.pendingAction && (
        <form autoComplete="off" onSubmit={e => { e.preventDefault(); void verificar(); }}>
          <div style={{
            background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8,
            padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#92400E',
          }}>
            <strong>Acción:</strong> {supervisor.pendingAction.action}
            {supervisor.pendingAction.detail && <> — {supervisor.pendingAction.detail}</>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Seleccionar supervisor</div>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}><Spin size="small" /></div>
              ) : !supervisores?.length ? (
                <div style={{ fontSize: 12, color: '#EF4444', padding: '6px 0' }}>
                  No hay administradores o contadores activos en esta empresa.
                </div>
              ) : (
                <Select
                  style={{ width: '100%' }}
                  placeholder="Seleccionar supervisor..."
                  showSearch
                  optionFilterProp="label"
                  value={supId}
                  onChange={(v: number) => { setSupId(v); setError(''); }}
                  options={supervisores.map(u => ({ value: u.id, label: u.nombre, role: u.role }))}
                  optionRender={option => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar size={22} style={{
                        background: option.data.role === 'admin' ? '#1E3A8A' : '#065F46',
                        fontSize: 11, flexShrink: 0,
                      }}>
                        {(option.data.label as string)?.charAt(0).toUpperCase()}
                      </Avatar>
                      <span style={{ flex: 1 }}>{option.data.label}</span>
                    </span>
                  )}
                />
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{esPin ? 'PIN' : 'Contraseña'}</div>
              <Input
                placeholder={esPin ? 'PIN del supervisor' : 'Contraseña del supervisor'}
                value={password}
                disabled={blockCountdown > 0}
                type="text"
                inputMode={esPin ? 'numeric' : undefined}
                maxLength={esPin ? 6 : undefined}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                data-form-type="other" data-lpignore="true" data-1p-ignore=""
                style={passwordVisible ? undefined : ({ WebkitTextSecurity: 'disc' } as any)}
                suffix={
                  <span onClick={() => setPasswordVisible(v => !v)} style={{ cursor: 'pointer', color: 'rgba(0,0,0,.45)' }}>
                    {passwordVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </span>
                }
                onChange={e => {
                  const v = esPin ? e.target.value.replace(/\D/g, '') : e.target.value;
                  setPassword(v); setError('');
                }}
                onPressEnter={e => { e.stopPropagation(); void verificar(); }}
              />
            </div>

            {error && <div style={{ color: '#EF4444', fontSize: 12 }}>{error}</div>}
            {blockCountdown > 0 && (
              <div style={{ color: '#EF4444', fontSize: 12 }}>
                Demasiados intentos — espera {blockCountdown}s.
              </div>
            )}

            <Button type="primary" onClick={() => void verificar()} loading={verificando} disabled={blockCountdown > 0} block>
              Autorizar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
