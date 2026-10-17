import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AutorizacionRemotaSonidoGlobal from './AutorizacionRemotaSonidoGlobal';
import { useAutorizacionRemotaSonidoStore } from '../../store/autorizacionRemotaSonido.store';

/**
 * Componente siempre montado en App.tsx (igual que SupervisorAuthGlobal) —
 * cubre el gate de rol (solo ADMIN/CONTADOR) y el banner de activación, sin
 * tocar Audio/Notification reales (ver autorizacionSonidoGate.test.ts para
 * la lógica pura del sonido en sí).
 */

const authState = vi.hoisted(() => ({ role: 'admin' as string | undefined, id: 1 as number | undefined }));
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({
    isAuth: () => true,
    user: authState.id != null ? { id: authState.id, role: authState.role } : null,
  }),
}));

const pendientesMock = vi.hoisted(() => vi.fn());
vi.mock('../../api/autorizacionRemota.api', () => ({
  autorizacionRemotaApi: { pendientes: pendientesMock },
}));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AutorizacionRemotaSonidoGlobal />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AutorizacionRemotaSonidoGlobal', () => {
  beforeEach(() => {
    pendientesMock.mockReset();
    authState.role = 'admin';
    authState.id = 1;
    useAutorizacionRemotaSonidoStore.setState({ vistas: new Set(), preferencia: null });
    document.title = 'HiCloud ERP';
  });

  afterEach(() => {
    cleanup();
    document.title = 'HiCloud ERP';
  });

  it('VENDEDOR: no monta nada — ni siquiera consulta pendientes', async () => {
    authState.role = 'vendedor';
    pendientesMock.mockResolvedValue([]);
    const { container } = montar();
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    expect(pendientesMock).not.toHaveBeenCalled();
  });

  it('VIEWER: tampoco monta nada', async () => {
    authState.role = 'viewer';
    pendientesMock.mockResolvedValue([]);
    const { container } = montar();
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('ADMIN sin pendientes: no muestra el banner de activación', async () => {
    pendientesMock.mockResolvedValue([]);
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    expect(screen.queryByText('Activar sonido')).not.toBeInTheDocument();
  });

  it('ADMIN con una pendiente sin ver y sin decidir la preferencia: muestra el banner', async () => {
    pendientesMock.mockResolvedValue([
      { id: 1, cajeroNombre: 'Samuel', clave: 'venta_credito', expiraEn: new Date(Date.now() + 60_000).toISOString() },
    ]);
    montar();
    expect(await screen.findByText('Activar sonido')).toBeInTheDocument();
  });

  it('CONTADOR con pendiente: también ve el banner', async () => {
    authState.role = 'contador';
    pendientesMock.mockResolvedValue([
      { id: 1, cajeroNombre: 'Samuel', clave: 'venta_credito', expiraEn: new Date(Date.now() + 60_000).toISOString() },
    ]);
    montar();
    expect(await screen.findByText('Activar sonido')).toBeInTheDocument();
  });

  it('click en "Activar sonido" guarda la preferencia en el store compartido', async () => {
    pendientesMock.mockResolvedValue([
      { id: 1, cajeroNombre: 'Samuel', clave: 'venta_credito', expiraEn: new Date(Date.now() + 60_000).toISOString() },
    ]);
    montar();
    const boton = await screen.findByText('Activar sonido');
    boton.click();
    await waitFor(() => expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('on'));
    // El banner desaparece una vez decidido (incluso sin recargar).
    await waitFor(() => expect(screen.queryByText('Activar sonido')).not.toBeInTheDocument());
  });

  it('con la preferencia ya activada (store), no vuelve a mostrar el banner', async () => {
    useAutorizacionRemotaSonidoStore.setState({ preferencia: 'on' });
    pendientesMock.mockResolvedValue([
      { id: 1, cajeroNombre: 'Samuel', clave: 'venta_credito', expiraEn: new Date(Date.now() + 60_000).toISOString() },
    ]);
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText('Activar sonido')).not.toBeInTheDocument();
  });

  it('solicitud ya marcada como vista: no muestra el banner aunque la preferencia siga sin decidir', async () => {
    useAutorizacionRemotaSonidoStore.setState({ vistas: new Set([1]) });
    pendientesMock.mockResolvedValue([
      { id: 1, cajeroNombre: 'Samuel', clave: 'venta_credito', expiraEn: new Date(Date.now() + 60_000).toISOString() },
    ]);
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText('Activar sonido')).not.toBeInTheDocument();
  });
});
