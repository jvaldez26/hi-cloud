import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TarjetaGrafica } from './TarjetaGrafica';

/**
 * Modo ejemplo (empresa nueva sin movimientos, ver useModoEjemplo) — el
 * mecanismo que comparten las 9 gráficas del catálogo que pasan por
 * TarjetaGrafica. Lo que se afirma aquí es literal al pedido: el badge y la
 * marca de agua aparecen, recargar queda deshabilitado, y la tarjeta deja
 * de ser "clic → listado" — no tiene sentido filtrar o navegar a partir de
 * datos que no son reales.
 */

function montar(props: Partial<Parameters<typeof TarjetaGrafica>[0]> = {}) {
  const onRefresh = vi.fn();
  const alClic    = vi.fn();
  render(
    <TarjetaGrafica
      titulo="Top clientes"
      onRefresh={onRefresh}
      vacio={false}
      alClic={alClic}
      {...props}
    >
      <div data-testid="grafica-real">contenido de la gráfica</div>
    </TarjetaGrafica>,
  );
  return { onRefresh, alClic };
}

describe('TarjetaGrafica — modo ejemplo', () => {
  it('sin ejemplo: no muestra el badge ni la marca de agua', () => {
    montar({ ejemplo: false });
    expect(screen.queryByText('Datos de ejemplo')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Ejemplo')).toHaveLength(0);
  });

  it('con ejemplo: muestra el badge "Datos de ejemplo" y la marca de agua repetida', () => {
    montar({ ejemplo: true });
    expect(screen.getByText('Datos de ejemplo')).toBeInTheDocument();
    // La marca de agua repite la palabra varias veces (rejilla 4x3) — no una sola vez.
    expect(screen.getAllByText('Ejemplo').length).toBeGreaterThan(5);
  });

  it('con ejemplo: el botón de recargar queda deshabilitado', () => {
    montar({ ejemplo: true });
    const boton = screen.getByRole('button', { name: /Actualizar Top clientes/ });
    expect(boton).toBeDisabled();
  });

  it('sin ejemplo: el botón de recargar sigue habilitado y funciona', async () => {
    const user = userEvent.setup();
    const { onRefresh } = montar({ ejemplo: false });
    const boton = screen.getByRole('button', { name: /Actualizar Top clientes/ });
    expect(boton).toBeEnabled();
    await user.click(boton);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('con ejemplo: la tarjeta no navega al hacer clic ni muestra "Ver listado completo"', async () => {
    const user = userEvent.setup();
    const { alClic } = montar({ ejemplo: true });
    expect(screen.queryByText('Ver listado completo →')).not.toBeInTheDocument();
    await user.click(screen.getByText('contenido de la gráfica'));
    expect(alClic).not.toHaveBeenCalled();
  });

  it('sin ejemplo (con alClic): la tarjeta sí navega y muestra "Ver listado completo"', async () => {
    const user = userEvent.setup();
    const { alClic } = montar({ ejemplo: false });
    expect(screen.getByText('Ver listado completo →')).toBeInTheDocument();
    await user.click(screen.getByText('contenido de la gráfica'));
    expect(alClic).toHaveBeenCalledTimes(1);
  });

  it('modo ejemplo con estado vacío (vacio=true): no se le pasa al usuario un vacío marcado como ejemplo', () => {
    // Guard de uso correcto: el caller SIEMPRE debe forzar vacio=false cuando
    // usa datos de ejemplo (los widgets reales lo hacen: vacio={vacioReal &&
    // !usarEjemplo}) — si alguien pasara ejemplo=true con vacio=true por
    // error, esta tarjeta cae al estado vacío normal (sin badge, sin marca de
    // agua) en vez de una mezcla confusa de ambos.
    montar({ ejemplo: true, vacio: true, mensajeVacio: 'Sin ventas' });
    expect(screen.getByText('Sin ventas')).toBeInTheDocument();
    expect(screen.queryByText('Datos de ejemplo')).not.toBeInTheDocument();
  });
});
