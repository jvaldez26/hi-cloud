/**
 * HiCloud ERP — Hook para suscripción a notificaciones push (Web Push API)
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('loading');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'denied') { setStatus('denied'); return; }

    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setStatus(sub ? 'subscribed' : 'unsubscribed');
    }).catch(() => setStatus('unsubscribed'));
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      setStatus('loading');

      // Obtener clave pública VAPID del servidor
      const keyRes = await api.get('/push/vapid-key');
      const vapidKey = (keyRes.data as any)?.data?.publicKey ?? (keyRes.data as any)?.publicKey ?? '';
      if (!vapidKey) { setStatus('unsubscribed'); return false; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      await api.post('/push/subscribe', {
        endpoint: sub.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
          auth:   arrayBufferToBase64(sub.getKey('auth')!),
        },
      });

      setStatus('subscribed');
      return true;
    } catch (err: any) {
      if (Notification.permission === 'denied') setStatus('denied');
      else setStatus('unsubscribed');
      console.error('[Push] Error al suscribir:', err.message);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
      setStatus('unsubscribed');
    } catch (err: any) {
      console.error('[Push] Error al desuscribir:', err.message);
    }
  }, []);

  const sendTest = useCallback(async (): Promise<void> => {
    await api.post('/push/test', {});
  }, []);

  return { status, subscribe, unsubscribe, sendTest };
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
