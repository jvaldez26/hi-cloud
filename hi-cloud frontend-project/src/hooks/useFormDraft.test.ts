import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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
