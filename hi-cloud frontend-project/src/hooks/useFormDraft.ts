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
import { message } from 'antd';
import * as Sentry from '@sentry/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ZONA_RD } from '../utils/fechaRD';

// Globales (dayjs.extend muta el objeto compartido) — se repite aquí a
// propósito en vez de confiar en que fechaRD.ts ya se haya importado antes:
// el orden de imports de un bundler no es algo de lo que depender. Llamar
// extend() dos veces es inofensivo.
dayjs.extend(utc);
dayjs.extend(timezone);

const DB_NAME       = 'hicloud-drafts';
const DB_VERSION    = 1;
const STORE_NAME    = 'form-drafts';
const TTL_MS         = 7 * 24 * 60 * 60 * 1000; // 7 días
const DEBOUNCE_MS    = 1000;
// v2 (2026-10-01): serializa dayjs/Date explícitamente — ver serializar()/
// deserializar() más abajo. Los borradores v1 (guardaban el objeto dayjs tal
// cual) perdían el prototipo al pasar por IndexedDB y el DatePicker reventaba
// al restaurar ("date4.isValid is not a function"). Subir el número basta
// para que esSnapshotValido() los descarte solos, sin lógica de migración.
const SNAPSHOT_VERSION = 2;

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

// ── Serialización — nunca confiar en que un objeto con prototipo sobreviva ──
// IndexedDB usa structured clone: a un dayjs (o un Date, o cualquier instancia
// de clase) le sobrevive la FORMA pero no el prototipo, así que
// `value instanceof Dayjs` da false y `value.isValid` ya no es una función al
// leerlo de vuelta. Cada dayjs se convierte aquí explícitamente a un marcador
// plano y se reconstruye al restaurar — nunca se guarda "a ciegas".

interface MarcadorFecha {
  __tipo: 'dayjs-fecha' | 'dayjs-instante';
  v:      string;
}

function esMarcadorFecha(v: unknown): v is MarcadorFecha {
  return !!v && typeof v === 'object'
    && ((v as any).__tipo === 'dayjs-fecha' || (v as any).__tipo === 'dayjs-instante')
    && typeof (v as any).v === 'string';
}

/** Objeto plano de verdad (`{...}` o salido de JSON) — no una instancia de clase, File, Map, Set, etc. */
function esObjetoPlano(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * values/extra → forma guardable en IndexedDB.
 *
 * - dayjs con hora en 00:00:00.000 → fecha de calendario pura (`YYYY-MM-DD`,
 *   sin zona — un vencimiento o una fecha de documento no debe correrse de
 *   día al reconstruirla, ver dRD() en fechaRD.ts).
 * - dayjs con cualquier otra hora → instante real, se guarda su ISO en UTC
 *   (`toISOString()`), que es inequívoco y se reconvierte a RD al leer.
 * - Date nativo → igual que un dayjs con hora (instante).
 * - Cualquier otro objeto con prototipo propio (File, Map, Set, una clase) →
 *   se omite: ningún formulario de este ERP necesita guardar uno de estos en
 *   un borrador hoy, y guardarlo "tal cual" es exactamente el bug que esto
 *   corrige para dayjs. Si algún día hace falta, se le añade su propio
 *   marcador explícito aquí — nunca se cuela sin convertir.
 */
function serializar(v: unknown): unknown {
  if (v == null) return v;
  if (dayjs.isDayjs(v)) {
    if (!v.isValid()) return undefined;
    const esFechaPura = v.hour() === 0 && v.minute() === 0 && v.second() === 0 && v.millisecond() === 0;
    return esFechaPura
      ? ({ __tipo: 'dayjs-fecha', v: v.format('YYYY-MM-DD') } satisfies MarcadorFecha)
      : ({ __tipo: 'dayjs-instante', v: v.toISOString() } satisfies MarcadorFecha);
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? undefined : ({ __tipo: 'dayjs-instante', v: v.toISOString() } satisfies MarcadorFecha);
  }
  if (Array.isArray(v)) return v.map(serializar);
  if (typeof v === 'object') {
    if (!esObjetoPlano(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const s = serializar(val);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  if (typeof v === 'function') return undefined;
  return v; // string | number | boolean
}

/**
 * Inverso de serializar(). La fecha de calendario se ancla a las 12:00 RD —
 * mismo truco que dRD() en fechaRD.ts — para que ningún formateo posterior la
 * empuje al día anterior o siguiente por un redondeo de zona.
 */
function deserializar(v: unknown): unknown {
  if (v == null) return v;
  if (esMarcadorFecha(v)) {
    const d = v.__tipo === 'dayjs-fecha'
      ? dayjs.tz(`${v.v} 12:00:00`, ZONA_RD)
      : dayjs(v.v).tz(ZONA_RD);
    return d; // puede venir inválido si v.v está corrupto — se valida aparte, ver contieneFechaInvalida()
  }
  if (Array.isArray(v)) return v.map(deserializar);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = deserializar(val);
    }
    return out;
  }
  return v;
}

/** Recorre un valor YA deserializado buscando algún dayjs inválido (marcador corrupto). */
function contieneFechaInvalida(v: unknown): boolean {
  if (v == null) return false;
  if (dayjs.isDayjs(v)) return !v.isValid();
  if (Array.isArray(v)) return v.some(contieneFechaInvalida);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(contieneFechaInvalida);
  return false;
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

        const descartarSilencioso = async (motivo: string) => {
          Sentry.captureMessage(`form-draft: ${motivo}, descartado`, {
            level: 'warning',
            tags:  { modulo: 'form-draft', formKey },
          });
          await dbDelete(clave).catch(() => {});
        };

        if (!esSnapshotValido(snap) || Date.now() - snap.savedAt > TTL_MS) {
          await descartarSilencioso('snapshot inválido o vencido');
          return;
        }

        // Deserializar AQUÍ (no en restaurar()) para poder validar las fechas
        // reconstruidas antes de ofrecer el banner — si algo quedó corrupto,
        // nunca se llega a mostrar "Restaurar" ni se toca el Form.
        let valoresDeserializados: Record<string, any>;
        let extraDeserializado: unknown;
        try {
          valoresDeserializados = deserializar(snap.values) as Record<string, any>;
          extraDeserializado    = snap.extra !== undefined ? deserializar(snap.extra) : undefined;
        } catch (err) {
          Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'deserializar', formKey } });
          await descartarSilencioso('no se pudo deserializar');
          return;
        }
        if (contieneFechaInvalida(valoresDeserializados) || contieneFechaInvalida(extraDeserializado)) {
          await descartarSilencioso('marcador de fecha corrupto');
          return;
        }

        snapshotPendienteRef.current = {
          ...snap,
          values: valoresDeserializados,
          extra:  extraDeserializado as TExtra,
        };
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
          values:         serializar(form.getFieldsValue(true)) as Record<string, any>,
          extra:          serializar(extra?.get()) as TExtra,
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

  /**
   * El snapshot pendiente YA llega deserializado y validado (ver el efecto de
   * arriba) — las fechas corruptas nunca llegan aquí. El try/catch de abajo
   * es una segunda red para lo que SÍ puede fallar de forma síncrona dentro
   * de setFieldsValue/extra.set (ej. una forma de valores que no calza con
   * los Form.Item declarados); un valor que antd solo rechaza al RENDERIZAR
   * el campo (como el bug real que motivó esto) ya no puede pasar porque
   * nunca llega siendo otra cosa que un dayjs válido.
   */
  const restaurar = useCallback((): FormDraftSnapshot<TExtra> | null => {
    const snap = snapshotPendienteRef.current;
    if (!snap) return null;
    try {
      form.setFieldsValue(snap.values);
      extra?.set(snap.extra as TExtra);
    } catch (err) {
      Sentry.captureException(err, { tags: { modulo: 'form-draft', fase: 'restaurar', formKey } });
      try { form.resetFields(); } catch { /* ya está en el peor caso posible */ }
      snapshotPendienteRef.current = null;
      setHayBorrador(false);
      setBorradorInfo(null);
      dbDelete(clave).catch(() => {});
      message.warning('No se pudo restaurar el borrador');
      return null;
    }
    setHayBorrador(false);
    Sentry.captureMessage('form-draft: restaurado', { level: 'info', tags: { modulo: 'form-draft', formKey } });
    return snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, extra, formKey, clave]);

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
