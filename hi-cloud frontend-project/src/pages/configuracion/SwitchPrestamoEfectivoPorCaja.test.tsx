import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Form } from 'antd';
import { SwitchPrestamoEfectivoPorCaja } from './ConfiguracionPage';
import { useModuloAddon } from '../../hooks/useModuloAddon';

// Aislamiento de producto (ver docs/prestamista/decisiones-pendientes.md,
// punto 14, y merge-readiness.md sección 2): el switch "Efectivo de
// préstamos por la caja del cajero" aparecía en la Configuración de TODAS
// las empresas del ERP, tuvieran o no el add-on Prestamista activo — puro
// ruido de interfaz para quien nunca usará el módulo. Mismo patrón de gating
// que ClinicaLayout/TransporteLayout/FarmaciaLayout/TallerLayout/OpticaLayout
// vía `useModuloAddon`, aplicado aquí a un control puntual en vez de a una
// pantalla completa.
vi.mock('../../hooks/useModuloAddon');

function Wrapper() {
  // El componente real vive dentro del <Form> de SeccionPOS — su
  // <Form.Item> necesita ese contexto para no reventar.
  const [form] = Form.useForm();
  return (
    <Form form={form}>
      <SwitchPrestamoEfectivoPorCaja />
    </Form>
  );
}

describe('SwitchPrestamoEfectivoPorCaja', () => {
  it('no se renderiza cuando la empresa NO tiene el add-on Prestamista activo', () => {
    vi.mocked(useModuloAddon).mockReturnValue({
      activo: false, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    } as any);

    render(<Wrapper />);

    expect(screen.queryByTestId('seccion-pos-prestamo-efectivo')).not.toBeInTheDocument();
    expect(screen.queryByText('Efectivo de préstamos por la caja del cajero')).not.toBeInTheDocument();
  });

  it('se renderiza cuando la empresa SÍ tiene el add-on Prestamista activo', () => {
    vi.mocked(useModuloAddon).mockReturnValue({
      activo: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn(),
    } as any);

    render(<Wrapper />);

    expect(screen.getByTestId('seccion-pos-prestamo-efectivo')).toBeInTheDocument();
    expect(screen.getByText('Efectivo de préstamos por la caja del cajero')).toBeInTheDocument();
  });
});
