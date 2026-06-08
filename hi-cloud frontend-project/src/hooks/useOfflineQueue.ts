/**
 * HiCloud ERP — Cola offline para el POS
 * Almacena ventas en IndexedDB cuando no hay conexión y las sincroniza al reconectarse.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

const DB_NAME    = 'hicloud-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pos-queue';

export interface OfflineSale {
  id:        string;
  timestamp: number;
  payload:   any;          // mismo body que POST /facturas
  status:    'pending' | 'syncing' | 'done' | 'error';
  error?:    string;
}

// ── Helpers IndexedDB ─────────────────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<OfflineSale[]> {
  const db   = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(sale: OfflineSale): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(sale);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useOfflineQueue() {
  const [queue,      setQueue]      = useState<OfflineSale[]>([]);
  const [isSyncing,  setIsSyncing]  = useState(false);
  const syncRef = useRef(false);

  const reload = useCallback(async () => {
    const all = await dbGetAll();
    setQueue(all.filter(s => s.status !== 'done'));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Escuchar mensaje del SW para disparar sincronización
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_POS_SALES') sync();
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // Auto-sync cuando vuelve la conexión
  useEffect(() => {
    const onOnline = () => { if (queue.some(s => s.status === 'pending')) sync(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queue]);

  /** Encola una venta para cuando haya conexión */
  const enqueue = useCallback(async (payload: any): Promise<string> => {
    const sale: OfflineSale = {
      id:        `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      payload,
      status:    'pending',
    };
    await dbPut(sale);
    await reload();
    // Registrar background sync si está disponible
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      await (reg as any).sync?.register('sync-pos-sales');
    }
    return sale.id;
  }, [reload]);

  /** Sincroniza todas las ventas pendientes contra el backend */
  const sync = useCallback(async () => {
    if (syncRef.current || !navigator.onLine) return;
    syncRef.current = true;
    setIsSyncing(true);

    try {
      const pending = (await dbGetAll()).filter(s => s.status === 'pending');
      // JWT está en httpOnly cookie — se envía automáticamente con credentials: 'include'

      for (const sale of pending) {
        // Marcar como syncing
        await dbPut({ ...sale, status: 'syncing' });
        await reload();

        try {
          // Crear factura
          const res = await fetch('/api/v1/facturas', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify(sale.payload),
          });

          if (!res.ok) throw new Error(await res.text());
          const factura = (await res.json()).data;

          // Emitir factura
          await fetch(`/api/v1/facturas/${factura.id}/estado`, {
            method:      'PATCH',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ estado: 'emitida' }),
          });

          await dbDelete(sale.id);
        } catch (err: any) {
          await dbPut({ ...sale, status: 'error', error: err.message });
        }
      }
    } finally {
      syncRef.current = false;
      setIsSyncing(false);
      await reload();
    }
  }, [reload]);

  const pendingCount = queue.filter(s => s.status === 'pending' || s.status === 'error').length;

  return { queue, pendingCount, isSyncing, enqueue, sync, reload };
}
