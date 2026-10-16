import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupervisorAuthModal from './SupervisorAuthModal';

/**
 * UI de "Solicitar autorización remota" dentro del modal genérico de Modo
 * Supervisor — complementa los tests de useSupervisor.remoto.test.ts (que
 * cubren la lógica) verificando que la pantalla realmente oculta/muestra la
 * opción y dispara solicitarAutorizacionRemota() con el motivo escrito.
 */

const apiMock = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: apiMock }));

function buildSupervisor(overrides: Partial<Record<string, any>> = {}) {
  return {
    pendingAction: { action: 'Venta a Crédito', detail: 'Monto: RD$1,500', clave: 'venta_credito' },
    pendingActionPermiteRemoto: true,
    remotoEnEspera: null,
    remotoResultado: null,
    resolveModal: vi.fn(),
    solicitarAutorizacionRemota: vi.fn().mockResolvedValue(undefined),
    cancelarAutorizacionRemota: vi.fn().mockResolvedValue(undefined),
    limpiarRemotoResultado: vi.fn(),
    ...overrides,
  } as any;
}

function renderModal(supervisor: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SupervisorAuthModal supervisor={supervisor} />
    </QueryClientProvider>,
  );
}

describe('SupervisorAuthModal — autorización remota', () => {
  it('política sin permiteRemoto: la opción "Solicitar autorización remota" NO aparece', async () => {
    renderModal(buildSupervisor({ pendingActionPermiteRemoto: false }));
    expect(await screen.findByText('Autorización de Supervisor')).toBeInTheDocument();
    expect(screen.queryByText('Solicitar autorización remota')).not.toBeInTheDocument();
  });

  it('política con permiteRemoto: la opción aparece y abre el formulario de motivo', async () => {
    renderModal(buildSupervisor());
    const link = await screen.findByText('Solicitar autorización remota');
    fireEvent.click(link);
    expect(await screen.findByPlaceholderText(/motivo de la solicitud|Explica por qué/i)).toBeInTheDocument();
  });

  it('enviar con motivo válido llama a solicitarAutorizacionRemota con el texto escrito', async () => {
    const supervisor = buildSupervisor();
    renderModal(supervisor);
    fireEvent.click(await screen.findByText('Solicitar autorización remota'));
    const textarea = await screen.findByPlaceholderText(/Explica por qué/i);
    fireEvent.change(textarea, { target: { value: 'Cliente de confianza, nadie presente en la tienda' } });
    fireEvent.click(screen.getByText('Enviar solicitud'));
    await screen.findByText('Enviar solicitud'); // deja correr el microtask del onClick
    expect(supervisor.solicitarAutorizacionRemota).toHaveBeenCalledWith('Cliente de confianza, nadie presente en la tienda');
  });

  it('motivo demasiado corto: no llama a solicitarAutorizacionRemota', async () => {
    const supervisor = buildSupervisor();
    renderModal(supervisor);
    fireEvent.click(await screen.findByText('Solicitar autorización remota'));
    const textarea = await screen.findByPlaceholderText(/Explica por qué/i);
    fireEvent.change(textarea, { target: { value: 'ab' } });
    fireEvent.click(screen.getByText('Enviar solicitud'));
    expect(await screen.findByText(/mínimo 5 caracteres/i)).toBeInTheDocument();
    expect(supervisor.solicitarAutorizacionRemota).not.toHaveBeenCalled();
  });

  it('en espera: muestra el contador y el botón Cancelar, que llama a cancelarAutorizacionRemota', async () => {
    const supervisor = buildSupervisor({ remotoEnEspera: { solicitudId: 1, expiraEn: Date.now() + 120_000 } });
    renderModal(supervisor);
    expect(await screen.findByText(/Esperando autorización/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(supervisor.cancelarAutorizacionRemota).toHaveBeenCalled();
  });

  it('resultado rechazada: muestra el comentario del supervisor', async () => {
    const supervisor = buildSupervisor({
      remotoResultado: { estado: 'rechazada', comentario: 'Monto fuera de política' },
    });
    renderModal(supervisor);
    expect(await screen.findByText(/rechazó la solicitud/i)).toBeInTheDocument();
    expect(screen.getByText('Monto fuera de política')).toBeInTheDocument();
  });
});
