import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AutorizacionRemotaSonidoGlobal from './AutorizacionRemotaSonidoGlobal';
import { useAutorizacionRemotaSonidoStore } from '../../store/autorizacionRemotaSonido.store';
import { guardarPreferenciaSonido } from './autorizacionSonidoPreferencia';

/**
 * Componente siempre montado en App.tsx (igual que SupervisorAuthGlobal) —
 * cubre el gate de rol (solo ADMIN/CONTADOR) y el desbloqueo automático de
 * audio con el primer gesto del usuario, sin tocar Web Audio API real (eso
 * se mockea; ver autorizacionSonidoGate.test.ts para la lógica pura del
 * sonido repetido, y desbloqueoAudioGate.test.ts para las reglas puras de
 * cuándo intentar el desbloqueo / mostrar el aviso).
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

const intentarDesbloquearAudioMock = vi.hoisted(() => vi.fn());
vi.mock('./beepAutorizacion', () => ({
  reproducirBeepAutorizacion: vi.fn(() => true),
  intentarDesbloquearAudio: intentarDesbloquearAudioMock,
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

async function disparaGesto() {
  await act(async () => {
    window.dispatchEvent(new Event('pointerdown'));
    // intentarDesbloquearAudio es async (resuelve una Promise) — deja que
    // el microtask del .then() del componente corra antes de aseverar.
    await new Promise(r => setTimeout(r, 0));
  });
}

describe('AutorizacionRemotaSonidoGlobal', () => {
  beforeEach(() => {
    localStorage.clear();
    pendientesMock.mockReset();
    pendientesMock.mockResolvedValue([]);
    intentarDesbloquearAudioMock.mockReset();
    intentarDesbloquearAudioMock.mockResolvedValue(true);
    authState.role = 'admin';
    authState.id = 1;
    useAutorizacionRemotaSonidoStore.setState({ vistas: new Set(), preferencia: null, audioDesbloqueado: false });
    document.title = 'HiCloud ERP';
  });

  afterEach(() => {
    cleanup();
    document.title = 'HiCloud ERP';
  });

  it('VENDEDOR: no monta nada — ni siquiera consulta pendientes', async () => {
    authState.role = 'vendedor';
    const { container } = montar();
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    expect(pendientesMock).not.toHaveBeenCalled();
  });

  it('VIEWER: tampoco monta nada', async () => {
    authState.role = 'viewer';
    const { container } = montar();
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('un gesto (pointerdown) en cualquier parte de la app desbloquea el audio y activa la preferencia', async () => {
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(false);

    await disparaGesto();

    expect(intentarDesbloquearAudioMock).toHaveBeenCalledTimes(1);
    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(true);
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('on');
  });

  it('un gesto por teclado (keydown) también desbloquea el audio', async () => {
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
      await new Promise(r => setTimeout(r, 0));
    });

    expect(intentarDesbloquearAudioMock).toHaveBeenCalledTimes(1);
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('on');
  });

  it('si el navegador no concede el desbloqueo en el primer gesto, la preferencia NO se fuerza a "on"', async () => {
    intentarDesbloquearAudioMock.mockResolvedValue(false);
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());

    await disparaGesto();

    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(false);
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBeNull();
  });

  it('el gesto se escucha una sola vez — un segundo gesto no vuelve a intentar el desbloqueo', async () => {
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());

    await disparaGesto();
    expect(intentarDesbloquearAudioMock).toHaveBeenCalledTimes(1);

    await disparaGesto();
    expect(intentarDesbloquearAudioMock).toHaveBeenCalledTimes(1);
  });

  it('con el sonido desactivado a mano en Perfil ("off"), el gesto NO lo reactiva solo', async () => {
    // El efecto de montaje sincroniza el store desde localStorage (misma
    // fuente que lee Perfil) — hay que guardar ahí, no solo en el store,
    // para que el "off" sobreviva al montaje del componente.
    guardarPreferenciaSonido(1, 'off');
    useAutorizacionRemotaSonidoStore.setState({ preferencia: 'off' });
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    await waitFor(() => expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('off'));

    await disparaGesto();

    expect(intentarDesbloquearAudioMock).not.toHaveBeenCalled();
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('off');
    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(false);
  });

  it('desmontar y remontar (navegar) no pierde el desbloqueo ya conseguido — el store no depende de la ruta', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalled());
    await disparaGesto();
    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(true);

    unmount(); // el componente real nunca se desmonta al navegar, pero esto prueba que el estado no vive en él
    montar();
    await waitFor(() => expect(pendientesMock).toHaveBeenCalledTimes(2));

    expect(useAutorizacionRemotaSonidoStore.getState().audioDesbloqueado).toBe(true);
    expect(useAutorizacionRemotaSonidoStore.getState().preferencia).toBe('on');
  });
});
