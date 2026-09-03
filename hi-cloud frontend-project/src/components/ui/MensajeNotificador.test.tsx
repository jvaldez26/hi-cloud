import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MensajeNotificador from './MensajeNotificador';
import { posEstado } from '../../utils/posEstado';

/**
 * Lo que se afirma aquí es el escenario que se perdía:
 *
 *   llega un mensaje mientras el cajero tiene el modal de cobro abierto
 *   → el toast espera, y el mensaje NO se marca visto todavía
 *   → se cierra el modal
 *   → aparece el toast, y SOLO entonces se marca visto
 *
 * Antes se marcaba visto en cuanto el poll devolvía el id, sin esperar a
 * mostrarlo. Si el cajero recargaba mientras cobraba, el servidor lo daba por
 * visto y el mensaje no se enseñaba nunca — en silencio.
 *
 * El tick del componente es de 1 s y aquí se usan timers reales: con fake
 * timers hay que orquestar también los de react-query, y el test se vuelve más
 * frágil que lo que prueba.
 */

const mensajesApiMock = vi.hoisted(() => ({
  getMensajesNoVistos: vi.fn(),
  getBandeja:           vi.fn(),
  marcarVisto:          vi.fn(),
}));
vi.mock('../../api/mensajes.api', () => ({ mensajesApi: mensajesApiMock }));

// El componente solo actúa si hay sesión y no es super_admin
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({
    isAuth: () => true,
    user:   { id: 1, nombre: 'Cajero', role: 'admin' },
  }),
}));

const MENSAJE = {
  id: 'msg-1',
  titulo: 'Nueva función disponible',
  cuerpo: 'Ya puedes aplicar descuentos en las cotizaciones.',
  tipo: 'novedad',
  fechaPublicacion: new Date().toISOString(),
  editadoEn: null, leidoEn: null, vistoEn: null, archivadoEn: null,
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MensajeNotificador />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  posEstado.modalCobroAbierto = false;
  mensajesApiMock.getMensajesNoVistos.mockResolvedValue(['msg-1']);
  mensajesApiMock.getBandeja.mockImplementation((tab: string) =>
    Promise.resolve(tab === 'novedades' ? [MENSAJE] : []));
  mensajesApiMock.marcarVisto.mockResolvedValue(undefined);
});

afterEach(() => { posEstado.modalCobroAbierto = false; });

describe('MensajeNotificador — no se marca visto antes de verse', () => {
  it('con el modal de cobro abierto espera, y NO marca visto hasta mostrarlo', async () => {
    posEstado.modalCobroAbierto = true;
    montar();

    // El poll ya devolvió el id y está encolado…
    await waitFor(() => expect(mensajesApiMock.getMensajesNoVistos).toHaveBeenCalled());

    // …pero mientras se cobra, ni toast ni visto. Dos ticks de margen.
    await new Promise(r => setTimeout(r, 2300));
    expect(screen.queryByText(MENSAJE.titulo)).toBeNull();
    expect(mensajesApiMock.marcarVisto).not.toHaveBeenCalled();

    // Se cierra la venta
    posEstado.modalCobroAbierto = false;

    // Ahora sí: aparece el toast…
    expect(await screen.findByText(MENSAJE.titulo, {}, { timeout: 4000 })).toBeInTheDocument();
    // …y solo entonces se registra el visto
    await waitFor(() => expect(mensajesApiMock.marcarVisto).toHaveBeenCalledWith('msg-1'));
    expect(mensajesApiMock.marcarVisto).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('sin el modal abierto lo muestra y marca visto, en ese orden', async () => {
    montar();

    expect(await screen.findByText(MENSAJE.titulo, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(mensajesApiMock.marcarVisto).toHaveBeenCalledWith('msg-1'));

    // Origen, acciones y aspa
    expect(screen.getByText('Novedad de HiCloud')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver mensaje/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Después' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  }, 15_000);

  it('si falla el registro del visto, el id vuelve a la cola y se reintenta', async () => {
    // Tragarse el fallo dejaba al servidor sin constancia: al recargar volvía a
    // salir igual, pero nadie se enteraba de que no se había registrado.
    mensajesApiMock.marcarVisto
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValue(undefined);

    montar();

    await screen.findByText(MENSAJE.titulo, {}, { timeout: 4000 });
    await waitFor(() => expect(mensajesApiMock.marcarVisto).toHaveBeenCalledTimes(1));

    // El tick solo reencola cuando no hay toast en pantalla. Se cierra a mano en
    // vez de esperar los 10 s del autocierre: la espera no aporta nada al caso y
    // se llevaba 12 s del suite.
    screen.getByRole('button', { name: 'Después' }).click();

    await waitFor(
      () => expect(mensajesApiMock.marcarVisto.mock.calls.length).toBeGreaterThan(1),
      { timeout: 6000 },
    );
  }, 12_000);

  it('un solo toast cuando llegan varios mensajes', async () => {
    const segundo = { ...MENSAJE, id: 'msg-2', titulo: 'Otro aviso' };
    mensajesApiMock.getMensajesNoVistos.mockResolvedValue(['msg-1', 'msg-2']);
    mensajesApiMock.getBandeja.mockImplementation((tab: string) =>
      Promise.resolve(tab === 'novedades' ? [MENSAJE, segundo] : []));

    montar();

    expect(await screen.findByText('Tienes 2 mensajes nuevos de HiCloud', {}, { timeout: 4000 }))
      .toBeInTheDocument();
    // No se apilan: ninguno de los títulos sueltos aparece
    expect(screen.queryByText(MENSAJE.titulo)).toBeNull();
    await waitFor(() => expect(mensajesApiMock.marcarVisto).toHaveBeenCalledTimes(2));
  }, 15_000);

  it('un AVISO también se notifica, no solo las novedades', async () => {
    // Este es el fallo que se descubrió en producción: la consulta filtraba
    // `tipo = 'novedad'` y los avisos —caídas de servicio, e-CF rechazados— no
    // llegaban a nadie. El tipo no decide si se notifica.
    const aviso = { ...MENSAJE, id: 'av-1', tipo: 'aviso',
      titulo: 'Interrupción temporal del servicio' };
    mensajesApiMock.getMensajesNoVistos.mockResolvedValue(['av-1']);
    mensajesApiMock.getBandeja.mockImplementation((tab: string) =>
      Promise.resolve(tab === 'principal' ? [aviso] : []));

    montar();

    expect(await screen.findByText(aviso.titulo, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(mensajesApiMock.marcarVisto).toHaveBeenCalledWith('av-1'));
  }, 15_000);

  it('el tipo cambia la etiqueta: aviso y novedad se ven distintos', async () => {
    const aviso = { ...MENSAJE, id: 'av-1', tipo: 'aviso', titulo: 'Servicio interrumpido' };
    mensajesApiMock.getMensajesNoVistos.mockResolvedValue(['av-1']);
    mensajesApiMock.getBandeja.mockImplementation((tab: string) =>
      Promise.resolve(tab === 'principal' ? [aviso] : []));

    montar();

    expect(await screen.findByText('Aviso de HiCloud', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('Novedad de HiCloud')).toBeNull();
  }, 15_000);

  it('mezclando tipos manda el aviso: lo urgente no se esconde', async () => {
    const aviso = { ...MENSAJE, id: 'av-1', tipo: 'aviso', titulo: 'Servicio interrumpido' };
    mensajesApiMock.getMensajesNoVistos.mockResolvedValue(['msg-1', 'av-1']);
    mensajesApiMock.getBandeja.mockImplementation((tab: string) =>
      Promise.resolve(tab === 'principal' ? [aviso] : [MENSAJE]));

    montar();

    expect(await screen.findByText('Tienes 2 mensajes nuevos de HiCloud', {}, { timeout: 4000 }))
      .toBeInTheDocument();
    // Con uno operativo en el lote, el toast se pinta como aviso
    expect(screen.getByText('Aviso de HiCloud')).toBeInTheDocument();
  }, 15_000);

  it('el super admin no recibe notificaciones: ni siquiera consulta', async () => {
    vi.resetModules();
    vi.doMock('../../store/auth.store', () => ({
      useAuthStore: (selector: any) => selector({
        isAuth: () => true,
        user:   { id: 1, nombre: 'Dev', role: 'super_admin' },
      }),
    }));
    const { default: Notificador } = await import('./MensajeNotificador');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Notificador /></MemoryRouter>
      </QueryClientProvider>,
    );
    await new Promise(r => setTimeout(r, 500));
    expect(mensajesApiMock.getMensajesNoVistos).not.toHaveBeenCalled();
  });
});
