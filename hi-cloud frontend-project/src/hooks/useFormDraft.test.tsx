import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, act, waitFor } from '@testing-library/react';
import { Form, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { ZONA_RD } from '../utils/fechaRD'; // también deja cargados los plugins utc/timezone de dayjs

// Los exports de @sentry/react no se pueden espiar con vi.spyOn (bindings ESM
// de solo lectura en este build) — se reemplaza el módulo entero.
vi.mock('@sentry/react', () => ({
  captureMessage:   vi.fn(),
  captureException: vi.fn(),
}));
import * as Sentry from '@sentry/react';
import {
  useFormDraft, claveBorrador, contarBorradoresDeUsuario, descartarBorradoresDeUsuario,
} from './useFormDraft';

const DEBOUNCE_ESPERA_MS = 1200; // > 1s del debounce real del hook

function makeForm(valoresIniciales: Record<string, any> = {}) {
  let valores = { ...valoresIniciales };
  return {
    getFieldsValue: vi.fn(() => valores),
    setFieldsValue: vi.fn((v: Record<string, any>) => { valores = { ...valores, ...v }; }),
  } as any;
}

describe('claveBorrador', () => {
  it('compone usuario:empresa:formKey', () => {
    expect(claveBorrador(1, 7, 'factura')).toBe('1:7:factura');
  });
  it('usa "_" cuando falta usuario o empresa', () => {
    expect(claveBorrador(undefined, null, 'factura')).toBe('_:_:factura');
  });
});

describe('useFormDraft', () => {
  beforeEach(() => {
    // Base de datos aparte por test — evita que un borrador de un test se
    // cuele en otro (fake-indexeddb no se resetea solo entre tests).
    vi.restoreAllMocks();
  });

  it('sin borrador previo, hayBorrador es false', () => {
    const form = makeForm();
    const { result } = renderHook(() => useFormDraft({
      formKey: `factura-${Math.random()}`, form, usuarioId: 1, empresaId: 7, idempotencyKey: 'k1',
    }));
    expect(result.current.hayBorrador).toBe(false);
    expect(result.current.borradorInfo).toBeNull();
  });

  it('autoguarda (debounced) los values del Form + extra, y una nueva instancia del hook lo detecta', async () => {
    const formKey = `factura-${Date.now()}-a`;
    const form1 = makeForm({ clienteId: 42 });
    let lineas = [{ id: 1, cantidad: 2 }];

    const { result: r1, unmount } = renderHook(() => useFormDraft({
      formKey, form: form1, usuarioId: 1, empresaId: 7,
      extra: { get: () => ({ lineas }), set: () => {} },
      idempotencyKey: 'clave-abc',
    }));

    act(() => { r1.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));
    unmount();

    const form2 = makeForm();
    const { result: r2 } = renderHook(() => useFormDraft({
      formKey, form: form2, usuarioId: 1, empresaId: 7, idempotencyKey: 'clave-abc',
    }));

    await waitFor(() => expect(r2.current.hayBorrador).toBe(true));
    expect(r2.current.borradorInfo?.idempotencyKey).toBe('clave-abc');
  });

  it('restaurar() rellena form.setFieldsValue + extra.set con lo guardado, y NUNCA hace red', async () => {
    const formKey = `factura-${Date.now()}-b`;
    const form1 = makeForm({ clienteId: 99 });
    const extraSet = vi.fn();

    const { result: r1, unmount } = renderHook(() => useFormDraft({
      formKey, form: form1, usuarioId: 2, empresaId: 7,
      extra: { get: () => ({ lineas: [{ id: 5 }] }), set: extraSet },
      idempotencyKey: 'clave-restaurar',
    }));
    act(() => { r1.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));
    unmount();

    const fetchSpy = vi.spyOn(global, 'fetch' as any).mockImplementation(() => { throw new Error('restaurar() no debe llamar red'); });

    const form2 = makeForm();
    const extraSet2 = vi.fn();
    const { result: r2 } = renderHook(() => useFormDraft({
      formKey, form: form2, usuarioId: 2, empresaId: 7,
      extra: { get: () => ({}), set: extraSet2 },
      idempotencyKey: 'clave-nueva-generada-al-abrir',
    }));
    await waitFor(() => expect(r2.current.hayBorrador).toBe(true));

    let snapshot: any;
    act(() => { snapshot = r2.current.restaurar(); });

    expect(form2.setFieldsValue).toHaveBeenCalledWith({ clienteId: 99 });
    expect(extraSet2).toHaveBeenCalledWith({ lineas: [{ id: 5 }] });
    expect(snapshot.idempotencyKey).toBe('clave-restaurar'); // el caller debe reusar ESTA, no la que abrió el form
    expect(r2.current.hayBorrador).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('descartar() borra el borrador — una instancia nueva ya no lo ve', async () => {
    const formKey = `factura-${Date.now()}-c`;
    const form1 = makeForm({ a: 1 });
    const { result: r1, unmount } = renderHook(() => useFormDraft({
      formKey, form: form1, usuarioId: 3, empresaId: 7, idempotencyKey: 'k',
    }));
    act(() => { r1.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));

    await act(async () => { await r1.current.descartar(); });
    expect(r1.current.hayBorrador).toBe(false);
    unmount();

    const form2 = makeForm();
    const { result: r2 } = renderHook(() => useFormDraft({
      formKey, form: form2, usuarioId: 3, empresaId: 7, idempotencyKey: 'k',
    }));
    await new Promise(res => setTimeout(res, 50));
    expect(r2.current.hayBorrador).toBe(false);
  });

  it('un borrador vencido (TTL 7 días) se descarta en silencio y no se ofrece', async () => {
    const formKey = `factura-${Date.now()}-d`;
    const form1 = makeForm({ a: 1 });
    const real = Date.now();
    const haceOchoDias = real - 8 * 24 * 60 * 60 * 1000;

    vi.spyOn(Date, 'now').mockReturnValue(haceOchoDias);
    const { result: r1, unmount } = renderHook(() => useFormDraft({
      formKey, form: form1, usuarioId: 4, empresaId: 7, idempotencyKey: 'k-vencida',
    }));
    act(() => { r1.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));
    unmount();
    vi.restoreAllMocks(); // volver al reloj real

    const form2 = makeForm();
    const { result: r2 } = renderHook(() => useFormDraft({
      formKey, form: form2, usuarioId: 4, empresaId: 7, idempotencyKey: 'otra',
    }));
    await new Promise(res => setTimeout(res, 50));
    expect(r2.current.hayBorrador).toBe(false);
  });

  it('un snapshot corrupto/de otra versión se descarta en silencio y avisa a Sentry, sin romper el formulario', async () => {
    const warnSpy = vi.mocked(Sentry.captureMessage);
    warnSpy.mockClear();
    const formKey = `factura-${Date.now()}-e`;

    // Simula un snapshot viejo escrito directamente en la base, sin pasar por el hook.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('hicloud-drafts', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('form-drafts', { keyPath: 'key' }); } catch { /* ya existe */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('form-drafts', 'readwrite');
      tx.objectStore('form-drafts').put({ key: `5:7:${formKey}`, formato: 'viejo-sin-version' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const form = makeForm();
    const { result } = renderHook(() => useFormDraft({
      formKey, form, usuarioId: 5, empresaId: 7, idempotencyKey: 'k',
    }));

    await new Promise(res => setTimeout(res, 50));
    expect(result.current.hayBorrador).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('habilitado:false (modo edición) nunca autoguarda ni ofrece restaurar', async () => {
    const formKey = `factura-${Date.now()}-f`;
    const form = makeForm({ a: 1 });
    const { result } = renderHook(() => useFormDraft({
      formKey, form, usuarioId: 6, empresaId: 7, idempotencyKey: 'k', habilitado: false,
    }));
    act(() => { result.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));
    expect(result.current.hayBorrador).toBe(false);
  });
});

describe('contarBorradoresDeUsuario / descartarBorradoresDeUsuario', () => {
  it('cuenta solo los del usuario+empresa indicados, y descartarlos los borra todos', async () => {
    const formKeyA = `cotizacion-${Date.now()}-a`;
    const formKeyB = `compra-${Date.now()}-b`;
    const formA = makeForm({ a: 1 });
    const formB = makeForm({ b: 1 });

    const { result: ra } = renderHook(() => useFormDraft({ formKey: formKeyA, form: formA, usuarioId: 9, empresaId: 7, idempotencyKey: 'x' }));
    const { result: rb } = renderHook(() => useFormDraft({ formKey: formKeyB, form: formB, usuarioId: 9, empresaId: 7, idempotencyKey: 'y' }));
    act(() => { ra.current.onValuesChange(); rb.current.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));

    await expect(contarBorradoresDeUsuario(9, 7)).resolves.toBeGreaterThanOrEqual(2);
    await expect(contarBorradoresDeUsuario(999, 7)).resolves.toBe(0); // otro usuario, no los ve

    await descartarBorradoresDeUsuario(9, 7);
    await expect(contarBorradoresDeUsuario(9, 7)).resolves.toBe(0);
  });
});

// ── Regresión: "date4.isValid is not a function" al restaurar (2026-10-01) ──
// IndexedDB usa structured clone: un dayjs guardado tal cual pierde el
// prototipo y, al pasar por setFieldsValue(), el DatePicker revienta al
// RENDERIZAR con ese valor — no es un throw síncrono, así que estos tests
// montan un <Form>+<DatePicker> de antd DE VERDAD (no el makeForm() de
// arriba), igual que lo haría FacturaFormPage.

interface ApiFormularioPrueba {
  form: ReturnType<typeof Form.useForm>[0];
  draft: ReturnType<typeof useFormDraft<{ lineas: { id: number; fecha?: any }[] }>>;
  setLineas: (v: { id: number; fecha?: any }[]) => void;
}

function montarFormularioConDatePicker(formKey: string, idempotencyKey = 'k') {
  let api!: ApiFormularioPrueba;
  function Comp() {
    const [form] = Form.useForm();
    const [lineas, setLineas] = useState<{ id: number; fecha?: any }[]>([{ id: 1 }]);
    const draft = useFormDraft<{ lineas: typeof lineas }>({
      formKey, form, usuarioId: 1, empresaId: 7,
      extra: { get: () => ({ lineas }), set: (v) => setLineas(v.lineas) },
      deps: [lineas],
      idempotencyKey,
    });
    api = { form, draft, setLineas };
    return (
      <Form form={form} onValuesChange={draft.onValuesChange}>
        <Form.Item name="fecha" label="Fecha">
          <DatePicker />
        </Form.Item>
      </Form>
    );
  }
  const utils = render(<Comp />);
  return { ...utils, getApi: () => api };
}

describe('useFormDraft — fechas (dayjs) sobreviven el guardado/restauración sin corromperse', () => {
  it('guarda y restaura una fecha del Form (calendario pura) y una línea con fecha-instante, sin correr el día ni lanzar al renderizar el DatePicker', async () => {
    const formKey = `factura-fecha-${Date.now()}`;
    const { getApi, unmount } = montarFormularioConDatePicker(formKey, 'clave-original');

    act(() => {
      // Medianoche local — "fecha de calendario pura" (como la que teclea el usuario).
      getApi().form.setFieldsValue({ fecha: dayjs('2026-09-30') });
      // Instante con hora, en el offset de RD — como podría venir una línea con fecha/hora.
      getApi().setLineas([{ id: 1, fecha: dayjs('2026-09-30T23:45:00-04:00') }]);
    });
    act(() => { getApi().draft.onValuesChange(); });
    await new Promise(res => setTimeout(res, DEBOUNCE_ESPERA_MS));
    unmount();

    const { getApi: getApi2 } = montarFormularioConDatePicker(formKey, 'clave-nueva');
    await waitFor(() => expect(getApi2().draft.hayBorrador).toBe(true));

    let snap: any;
    await act(async () => {
      snap = getApi2().draft.restaurar();
      await Promise.resolve(); // deja asentar el efecto interno del DatePicker con el nuevo valor
    });

    expect(snap.idempotencyKey).toBe('clave-original');

    // El DatePicker se re-renderiza con el valor restaurado — si fuera un
    // objeto sin prototipo dayjs, antd revienta aquí (no antes). Llegar a
    // esta línea sin que `act()` haya lanzado ya prueba la regresión.
    const fechaRestaurada = getApi2().form.getFieldValue('fecha');
    expect(dayjs.isDayjs(fechaRestaurada)).toBe(true);
    expect(fechaRestaurada.isValid()).toBe(true);
    expect(fechaRestaurada.format('YYYY-MM-DD')).toBe('2026-09-30'); // el día NO se corrió

    const lineaRestaurada = snap.extra.lineas[0];
    expect(dayjs.isDayjs(lineaRestaurada.fecha)).toBe(true);
    expect(lineaRestaurada.fecha.isValid()).toBe(true);
    expect(lineaRestaurada.fecha.tz(ZONA_RD).format('YYYY-MM-DD HH:mm')).toBe('2026-09-30 23:45');
  });

  it('un snapshot v2 con un marcador de fecha corrupto se descarta en silencio — nunca se ofrece restaurar, el formulario sigue vivo', async () => {
    const warnSpy = vi.mocked(Sentry.captureMessage);
    warnSpy.mockClear();
    const formKey = `factura-fecha-corrupta-${Date.now()}`;
    const clave = `1:7:${formKey}`;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('hicloud-drafts', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('form-drafts', { keyPath: 'key' }); } catch { /* ya existe */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('form-drafts', 'readwrite');
      tx.objectStore('form-drafts').put({
        key: clave, formKey, version: 2, savedAt: Date.now(), idempotencyKey: 'x',
        values: { fecha: { __tipo: 'dayjs-fecha', v: 'no-es-una-fecha-valida' } },
        extra: { lineas: [] },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const { getApi } = montarFormularioConDatePicker(formKey);
    await new Promise(res => setTimeout(res, 80));

    expect(getApi().draft.hayBorrador).toBe(false); // nunca llegó a ofrecerse
    expect(warnSpy).toHaveBeenCalled();
    // El propio render de montarFormularioConDatePicker() no lanzó — la página sigue viva.
    expect(getApi().form.getFieldValue('fecha')).toBeUndefined();
  });

  it('un borrador v1 (versión vieja, guardaba dayjs sin convertir) se descarta solo al detectarlo — nunca se ofrece restaurar', async () => {
    const formKey = `factura-v1-vieja-${Date.now()}`;
    const clave = `1:7:${formKey}`;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('hicloud-drafts', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('form-drafts', 'readwrite');
      // Representa lo que un snapshot v1 real dejaba tras pasar por structured
      // clone: el dayjs llega como objeto plano, sin isValid/format.
      tx.objectStore('form-drafts').put({
        key: clave, formKey, version: 1, savedAt: Date.now(), idempotencyKey: 'x',
        values: { fecha: { $d: '2026-09-30T00:00:00.000Z', $y: 2026 } }, // sin prototipo Dayjs
        extra: { lineas: [] },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const { getApi } = montarFormularioConDatePicker(formKey);
    await new Promise(res => setTimeout(res, 80));

    expect(getApi().draft.hayBorrador).toBe(false);
  });
});
