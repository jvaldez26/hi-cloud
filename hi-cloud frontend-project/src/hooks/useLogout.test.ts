import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Modal } from 'antd';
import { useAuthStore } from '../store/auth.store';
import { useLogout } from './useLogout';

const formDraftMock = vi.hoisted(() => ({
  listarBorradoresDeUsuario:  vi.fn(),
  descartarBorradoresDeUsuario: vi.fn(),
  nombreFormKey: (formKey: string) => ({ factura: 'Factura', 'compra-nueva': 'Compra' } as Record<string, string>)[formKey] ?? formKey,
}));
vi.mock('./useFormDraft', () => formDraftMock);

const authApiMock = vi.hoisted(() => ({ logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../api/auth.api', () => ({ authApi: authApiMock }));

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(MemoryRouter, null, children);
}

// Caso real (2026-10-03): "Tienes 2 borradores sin guardar" no decía EN QUÉ
// formularios — el usuario no tenía ninguna pista de dónde ir a buscarlos.
describe('useLogout — aviso de borradores sin guardar nombra los formularios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 11, nombre: 'Ana', email: 'a@a.com', role: 'admin' }, empresaActual: 7 } as any);
  });

  it('con borradores en Factura y dos en Compra: el contenido del modal los nombra, con el conteo para el repetido', async () => {
    formDraftMock.listarBorradoresDeUsuario.mockResolvedValue([
      { formKey: 'compra-nueva', savedAt: 3 },
      { formKey: 'compra-nueva', savedAt: 2 },
      { formKey: 'factura', savedAt: 1 },
    ]);
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockImplementation((opts: any) => { opts.onCancel?.(); return {} as any; });

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => { await result.current(); });

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Tienes 3 borradores sin guardar',
      content: expect.stringContaining('Compra (x2)'),
    }));
    expect(confirmSpy.mock.calls[0][0].content).toContain('Factura');
  });

  it('sin borradores: no muestra ningún modal, cierra sesión directo', async () => {
    formDraftMock.listarBorradoresDeUsuario.mockResolvedValue([]);
    const confirmSpy = vi.spyOn(Modal, 'confirm');

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => { await result.current(); });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(authApiMock.logout).toHaveBeenCalled();
  });

  it('"Conservar" (cancelar el modal): no cierra sesión ni descarta los borradores', async () => {
    formDraftMock.listarBorradoresDeUsuario.mockResolvedValue([{ formKey: 'factura', savedAt: 1 }]);
    vi.spyOn(Modal, 'confirm').mockImplementation((opts: any) => { opts.onCancel?.(); return {} as any; });

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => { await result.current(); });

    expect(formDraftMock.descartarBorradoresDeUsuario).not.toHaveBeenCalled();
    expect(authApiMock.logout).not.toHaveBeenCalled();
  });

  it('"Descartar y salir" (confirmar el modal): descarta los borradores y cierra sesión', async () => {
    formDraftMock.listarBorradoresDeUsuario.mockResolvedValue([{ formKey: 'factura', savedAt: 1 }]);
    vi.spyOn(Modal, 'confirm').mockImplementation((opts: any) => { opts.onOk?.(); return {} as any; });

    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => { await result.current(); });

    expect(formDraftMock.descartarBorradoresDeUsuario).toHaveBeenCalledWith(11, 7);
    expect(authApiMock.logout).toHaveBeenCalled();
  });
});
