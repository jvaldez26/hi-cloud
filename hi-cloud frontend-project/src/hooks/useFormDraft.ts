/**
 * HiCloud ERP — Recuperación de borradores de formularios.
 *
 * Autoguarda en IndexedDB (nunca en el servidor) el contenido de un
 * formulario de creación mientras el usuario lo llena, para que un cierre de
 * sesión involuntario, un F5 o un crash del navegador no se lleve el trabajo.
 *
 * Base de datos PROPIA ("hicloud-drafts") — nunca toca "hicloud-offline" (la
 * cola de ventas del POS, ver useOfflineQueue.ts) ni su versión: son dos
 * conceptos distintos (una es una cola de reintento, esta es un borrador
 * mutable por formulario) y mezclarlas sería arriesgar la una al tocar la otra.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormInstance } from 'antd';
import * as Sentry from '@sentry/react';

const DB_NAME       = 'hicloud-drafts';
const DB_VERSION    = 1;
const STORE_NAME    = 'form-drafts';
const TTL_MS         = 7 * 24 * 60 * 60 * 1000; // 7 días
const DEBOUNCE_MS    = 1000;
const SNAPSHOT_VERSION = 1;

export interface FormDraftSnapshot<TExtra = unknown> {
  key:            string; // usuarioId:empresaId:formKey
  formKey:        string;
  values:         Record<string, any>;
  extra?:         TExtra;
  idempotencyKey: string;
  savedAt:        number;
  version:        number;
}

export function claveBorrador(usuarioId: number | string | undefined | null, empresaId: number | string | undefined | null, formKey: string): string {
  return `${usuarioId ?? '_'}:${empresaId ?? '_'}:${formKey}`;
}

// ── Helpers IndexedDB nativos (mismo estilo que useOfflineQueue.ts) ─────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGet(key: string): Promise<FormDraftSnapshot | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<FormDraftSnapshot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPut(snapshot: FormDraftSnapshot): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(snapshot);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Un snapshot con forma reconocible, de la versión que sabemos leer. */
function esSnapshotValido(s: unknown): s is FormDraftSnapshot {
  return !!s && typeof s === 'object'
    && typeof (s as any).key === 'string'
    && typeof (s as any).idempotencyKey === 'string'
    && typeof (s as any).savedAt === 'number'
    && (s as any).version === SNAPSHOT_VERSION
    && typeof (s as any).values === 'object';
}

/**
 * Purga de borradores vencidos (TTL 7 días) — se llama UNA VEZ al abrir la
 * app (ver App.tsx). Nunca lanza: un fallo aquí no debe impedir que la app
 * cargue.
 */
export async function purgarBorradoresVencidos(): Promise<void> {
  try {
    const todos = await dbGetAll();
    const ahora = Date.now();
    await Promise.all(
      todos
        .filter(s => !esSnapshotValido(s) || ahora - s.savedAt > TTL_MS)
        .map(s => dbDelete((s as any).key).catch(() => {})),
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'purga-ttl' } });
  }
}

/** Cuántos borradores vigentes (no vencidos) tiene este usuario en esta empresa — para el modal de logout. */
export async function contarBorradoresDeUsuario(usuarioId: number | string | undefined | null, empresaId: number | string | undefined | null): Promise<number> {
  try {
    const todos = await dbGetAll();
    const ahora = Date.now();
    const prefijo = `${usuarioId ?? '_'}:${empresaId ?? '_'}:`;
    return todos.filter(s => esSnapshotValido(s) && s.key.startsWith(prefijo) && ahora - s.savedAt <= TTL_MS).length;
  } catch {
    return 0; // sin IndexedDB (modo privado, etc.) — no bloquear el logout por esto
  }
}

/** Descarta TODOS los borradores vigentes de este usuario en esta empresa — "Descartar y salir" del modal de logout. */
export async function descartarBorradoresDeUsuario(usuarioId: number | string | undefined | null, empresaId: number | string | undefined | null): Promise<void> {
  try {
    const todos = await dbGetAll();
    const prefijo = `${usuarioId ?? '_'}:${empresaId ?? '_'}:`;
    await Promise.all(todos.filter(s => s.key?.startsWith(prefijo)).map(s => dbDelete(s.key).catch(() => {})));
  } catch (err) {
    Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'descartar-al-salir' } });
  }
}

export interface UseFormDraftOpts<TExtra> {
  /** Identifica el formulario — único por módulo (ej. 'factura', 'cotizacion'). */
  formKey:        string;
  form:           FormInstance;
  usuarioId:      number | string | undefined | null;
  empresaId:      number | string | undefined | null;
  /** Estado fuera del Form (ej. líneas en useState) que también debe guardarse/restaurarse. */
  extra?:         { get: () => TExtra; set: (v: TExtra) => void };
  /** Dispara un autoguardado cuando cambian (ej. [lineas]) — además del autoguardado en onValuesChange. */
  deps?:          React.DependencyList;
  idempotencyKey: string;
  /** false en modo edición: no autoguarda ni ofrece restaurar (fuera de alcance — ver diseño). */
  habilitado?:    boolean;
}

export interface BorradorInfo {
  savedAt:        number;
  idempotencyKey: string;
}

export function useFormDraft<TExtra = unknown>(opts: UseFormDraftOpts<TExtra>) {
  const { formKey, form, usuarioId, empresaId, extra, deps = [], idempotencyKey, habilitado = true } = opts;

  const clave = claveBorrador(usuarioId, empresaId, formKey);

  const [hayBorrador, setHayBorrador]   = useState(false);
  const [borradorInfo, setBorradorInfo] = useState<BorradorInfo | null>(null);
  const snapshotPendienteRef = useRef<FormDraftSnapshot<TExtra> | null>(null);
  const debounceRef          = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sinGuardarRef        = useRef(false); // para beforeunload — hubo al menos un autoguardado real

  // ── Detectar borrador existente al montar ─────────────────────────────────
  useEffect(() => {
    if (!habilitado) return;
    let cancelado = false;
    (async () => {
      try {
        const snap = await dbGet(clave);
        if (cancelado) return;
        if (snap === undefined) return;
        if (!esSnapshotValido(snap) || Date.now() - snap.savedAt > TTL_MS) {
          // Corrupto, de otra versión, o vencido — se descarta en silencio.
          if (snap) {
            Sentry.captureMessage('form-draft: snapshot inválido o vencido, descartado', {
              level: 'warning',
              tags:  { modulo: 'form-draft', formKey },
            });
          }
          await dbDelete(clave).catch(() => {});
          return;
        }
        snapshotPendienteRef.current = snap as FormDraftSnapshot<TExtra>;
        setHayBorrador(true);
        setBorradorInfo({ savedAt: snap.savedAt, idempotencyKey: snap.idempotencyKey });
      } catch (err) {
        Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'leer', formKey } });
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado]);

  // ── Autoguardado debounced ─────────────────────────────────────────────────
  const guardar = useCallback(() => {
    if (!habilitado) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const snapshot: FormDraftSnapshot<TExtra> = {
          key:            clave,
          formKey,
          values:         form.getFieldsValue(true),
          extra:          extra?.get(),
          idempotencyKey,
          savedAt:        Date.now(),
          version:        SNAPSHOT_VERSION,
        };
        await dbPut(snapshot);
        sinGuardarRef.current = true;
      } catch (err) {
        // Nunca romper el formulario por un fallo de guardado del borrador.
        Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'guardar', formKey } });
      }
    }, DEBOUNCE_MS);
  }, [clave, habilitado, form, extra, idempotencyKey, formKey]);

  // Autoguardar cuando cambian las deps (líneas, etc.) — además de onValuesChange,
  // que el caller conecta al <Form onValuesChange={onValuesChange}>.
  useEffect(() => {
    if (!habilitado) return;
    guardar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ── beforeunload: avisa si hay cambios sin guardar en el SERVIDOR ──────────
  // (el borrador en sí ya está a salvo en IndexedDB; esto es para que el
  // usuario no cierre la pestaña pensando que ya guardó cuando no lo hizo).
  useEffect(() => {
    if (!habilitado) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!sinGuardarRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [habilitado]);

  const restaurar = useCallback((): FormDraftSnapshot<TExtra> | null => {
    const snap = snapshotPendienteRef.current;
    if (!snap) return null;
    form.setFieldsValue(snap.values);
    extra?.set(snap.extra as TExtra);
    setHayBorrador(false);
    Sentry.captureMessage('form-draft: restaurado', { level: 'info', tags: { modulo: 'form-draft', formKey } });
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, extra, formKey]);

  const descartar = useCallback(async () => {
    await dbDelete(clave).catch(() => {});
    snapshotPendienteRef.current = null;
    sinGuardarRef.current = false;
    setHayBorrador(false);
    setBorradorInfo(null);
  }, [clave]);

  /** Se llama tras guardar con éxito en el servidor — borra el borrador local. */
  const limpiar = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    sinGuardarRef.current = false;
    await dbDelete(clave).catch(() => {});
  }, [clave]);

  return {
    hayBorrador,
    borradorInfo,
    restaurar,
    descartar,
    limpiar,
    /** Conectar a <Form onValuesChange={onValuesChange}> para el autoguardado por campo. */
    onValuesChange: guardar,
  };
}
