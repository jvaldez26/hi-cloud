import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Input, Button, Typography, Alert } from 'antd';
import * as Sentry from '@sentry/react';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { registerReauthHandler } from '../../utils/sessionEvents';
import { credencialesFueronRechazadas } from '../../pages/pos/reautenticacionGate';

const { Text } = Typography;

/**
 * Reautenticación in-place para CUALQUIER pantalla (no solo el POS): cuando
 * client.ts agota los reintentos de /auth/refresh, le da a esta pantalla la
 * oportunidad de pedir la contraseña sin navegar a /login — así la petición
 * que falló (ej. guardar una factura) se reintenta sola tras reautenticar, en
 * vez de perder lo que el usuario tenía abierto.
 *
 * Se registra como handler "por defecto" (ver sessionEvents.ts): el POS
 * sigue con el suyo propio mientras está montado (reusa pantallaBloqueada,
 * más rico — modo supervisor, cambio de usuario), y al desmontarse vuelve a
 * este en vez de quedarse sin ninguno.
 *
 * Mismo flujo que POSPage.desbloquearPantalla() en su rama
 * `reautenticandoTrasFallo` — aquí no hay nada más que esa rama: sin
 * "cambio de usuario" ni bloqueo por inactividad, que son del POS.
 */
export default function ReautenticacionGlobalModal() {
  const [abierto,          setAbierto]          = useState(false);
  const [password,         setPassword]         = useState('');
  const [verificando,      setVerificando]      = useState(false);
  const [error,            setError]            = useState('');
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const [bloqueadoHasta,   setBloqueadoHasta]   = useState(0);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const iniciar = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPassword(''); setError('');
      setIntentosFallidos(0); setBloqueadoHasta(0);
      setAbierto(true);
    });
  }, []);

  useEffect(() => {
    registerReauthHandler(iniciar, true);
    return () => registerReauthHandler(null, true);
  }, [iniciar]);

  const cerrar = (ok: boolean) => {
    setAbierto(false);
    resolverRef.current?.(ok);
    resolverRef.current = null;
  };

  const verificar = async () => {
    if (!password.trim()) { setError('Ingresa tu contraseña'); return; }
    if (bloqueadoHasta > Date.now()) {
      const seg = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
      setError(`Demasiados intentos. Espera ${seg}s.`);
      return;
    }
    setVerificando(true); setError('');
    const user = useAuthStore.getState().user; // nunca el de un cierre viejo — ver LoginPage por el mismo motivo
    try {
      if (!user?.email) throw new Error('Sin correo de sesión');
      const resp: any = await api.post('/auth/login', { identificador: user.email, password });
      const data = resp?.data?.data ?? resp?.data;

      // 2FA o sesión activa en otro lado — ninguno se resuelve en este modal
      // (sería mucho para un caso raro). Se cierra y cae al /login normal,
      // que igual conserva el borrador (useFormDraft) y el carrito del POS.
      if (data?.requiresTwoFactor || data?.requiresSessionConfirmation) {
        cerrar(false);
        return;
      }
      // El reingreso no es un "cambiar usuario": si el login devuelve otra
      // cuenta, se rechaza aunque la contraseña fuera válida para ella.
      if (data?.user?.id != null && data.user.id !== user?.id) {
        throw Object.assign(new Error('Usuario distinto al de la sesión'), { usuarioDistinto: true });
      }
      cerrar(true);
    } catch (e: any) {
      const status = e?.response?.status;
      const rechazadas = credencialesFueronRechazadas({
        status, reautenticandoTrasFallo: true, usuarioDistinto: !!e?.usuarioDistinto,
      });
      if (!rechazadas) {
        Sentry.captureException(e, {
          tags:  { modulo: 'auth', fase: 'reautenticacion-global' },
          extra: { status: status ?? null, usuarioDistinto: !!e?.usuarioDistinto },
        });
        setError(e?.usuarioDistinto ? 'No coincide con el usuario de esta sesión' : 'No se pudo verificar, intenta de nuevo');
        setVerificando(false);
        return;
      }
      const nuevo = intentosFallidos + 1;
      setIntentosFallidos(nuevo);
      if (nuevo >= 3) {
        setBloqueadoHasta(Date.now() + 30_000);
        setError('Demasiados intentos fallidos. Espera 30 segundos.');
        setIntentosFallidos(0);
      } else {
        setError(`Contraseña incorrecta (intento ${nuevo}/3)`);
      }
      setVerificando(false);
      return;
    }
    setVerificando(false);
  };

  if (!abierto) return null;

  return (
    <Modal
      open={abierto}
      title="Tu sesión necesita renovarse"
      closable={false}
      maskClosable={false}
      footer={[
        <Button key="salir" onClick={() => cerrar(false)}>Salir</Button>,
        <Button key="ok" type="primary" loading={verificando} onClick={verificar}>Continuar</Button>,
      ]}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Tu sesión expiró. Ingresa tu contraseña para seguir sin perder lo que tenías abierto.
      </Text>
      <Input.Password
        value={password}
        onChange={e => setPassword(e.target.value)}
        onPressEnter={verificar}
        placeholder="Contraseña"
        autoFocus
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />}
    </Modal>
  );
}
