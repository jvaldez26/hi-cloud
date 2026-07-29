import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

/** Mapeo entidad → queryKeys que deben invalidarse */
const ENTITY_KEYS: Record<string, string[][]> = {
  factura:    [['facturas'], ['factura']],
  producto:   [['productos'], ['pos-products-scan'], ['inventario']],
  cliente:    [['clientes'], ['clientes-pos']],
  proveedor:  [['proveedores']],
  caja:       [['caja-hoy'], ['caja-hist'], ['caja-resumen'], ['pos-caja-hoy']],
  inventario: [['inventario'], ['pos-products-scan']],
  cxc:        [['cxc']],
  cotizacion: [['cotizaciones']],
  compra:     [['compras']],
  conduce:    [['conduces']],
  vendedor:   [['vendedores'], ['vendedores-sel']],
};

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

let _globalSocket: Socket | null = null;
const _statusListeners = new Set<(s: RealtimeStatus) => void>();

function setGlobalStatus(s: RealtimeStatus) {
  _statusListeners.forEach(fn => fn(s));
}

/** Hook principal — montar UNA VEZ en AppLayout */
export function useRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const empresaId = localStorage.getItem('empresaId');
    if (!empresaId) return; // sin empresa → sin socket

    if (_globalSocket?.connected) return; // ya hay conexión activa

    // withCredentials: true envía la cookie httpOnly access_token en el handshake.
    // El gateway lee la cookie como fallback cuando no hay token explícito (S-23).
    const socket = io('/realtime', {
      auth:                 { empresaId: Number(empresaId) },
      withCredentials:      true,
      transports:           ['websocket', 'polling'],
      reconnectionDelay:    1000,
      reconnectionDelayMax: 15000,
      reconnectionAttempts: Infinity,
    });

    _globalSocket = socket;
    (window as any).__hicloudSocket = socket;
    setGlobalStatus('connecting');

    socket.on('connect', () => {
      setGlobalStatus('connected');
    });

    socket.on('cambio', ({ entidad }: { entidad: string; accion: string; id?: number }) => {
      const keys = ENTITY_KEYS[entidad] ?? [[entidad]];
      keys.forEach(key => qc.invalidateQueries({ queryKey: key }));
    });

    socket.on('disconnect', () => {
      setGlobalStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setGlobalStatus('disconnected');
    });

    return () => {
      socket.disconnect();
      _globalSocket = null;
      setGlobalStatus('disconnected');
    };
  }, []);
}

/** Expone el socket global para suscripciones ad-hoc (ej: pos:ecf) */
export function getGlobalSocket() { return _globalSocket; }

/** Hook liviano para leer el estado de la conexión en cualquier componente */
export function useRealtimeStatus(): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>(
    _globalSocket?.connected ? 'connected' : 'disconnected',
  );

  useEffect(() => {
    _statusListeners.add(setStatus);
    return () => { _statusListeners.delete(setStatus); };
  }, []);

  return status;
}
