import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Form } from 'antd';
import { SwitchSolicitudesExigirOtroAprobador } from './ConfiguracionPage';
import { useModuloAddon } from '../../hooks/useModuloAddon';

// Decisión de negocio (2026-10-13): el switch "Exigir que otra persona
// apruebe las solicitudes de préstamo" solo tiene sentido con el add-on
// Prestamista activo — mismo patrón de gating que
// SwitchPrestamoEfectivoPorCaja.
vi.mock('../../hooks/useModuloAddon');

function Wrapper() {
  // Vive dentro del <Form> de SeccionSeguridad — su <Form.Item> necesita
  // ese contexto para no reventar.
  const [form] = Form.useForm();
  return (
    <Form form={form}>
      <SwitchSolicitudesExigirOtroAprobador />
    </Form>
  );
}

describe('SwitchSolicitudesExigirOtroAprobador', () => {
  it('no se renderiza cuando la empresa NO tiene el add-on Prestamista activo', () => {
    vi.mocked(useModuloAddon).mockReturnValue({
      activo: false, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    } as any);

    render(<Wrapper />);

    expect(screen.queryByTestId('seccion-seguridad-solicitudes-otro-aprobador')).not.toBeInTheDocument();
    expect(screen.queryByText('Exigir que otra persona apruebe las solicitudes de préstamo')).not.toBeInTheDocument();
  });

  it('se renderiza cuando la empresa SÍ tiene el add-on Prestamista activo', () => {
    vi.mocked(useModuloAddon).mockReturnValue({
      activo: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    } as any);

    render(<Wrapper />);

    expect(screen.getByTestId('seccion-seguridad-solicitudes-otro-aprobador')).toBeInTheDocument();
    expect(screen.getByText('Exigir que otra persona apruebe las solicitudes de préstamo')).toBeInTheDocument();
  });
});
