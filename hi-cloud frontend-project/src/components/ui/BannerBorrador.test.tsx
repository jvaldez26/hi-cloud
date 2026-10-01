import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BannerBorrador from './BannerBorrador';

describe('BannerBorrador', () => {
  it('sin yaExiste, ofrece Restaurar y Descartar con la fecha del borrador', () => {
    const onRestaurar = vi.fn();
    const onDescartar = vi.fn();
    render(<BannerBorrador savedAt={Date.parse('2026-09-01T10:00:00Z')} onRestaurar={onRestaurar} onDescartar={onDescartar} />);

    expect(screen.getByText(/Tienes un borrador sin guardar de/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(onRestaurar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDescartar).toHaveBeenCalledTimes(1);
  });

  it('con yaExiste, muestra el enlace al documento y SOLO ofrece descartar (nunca restaurar)', () => {
    const onRestaurar = vi.fn();
    const onDescartar = vi.fn();
    render(
      <BannerBorrador
        savedAt={Date.now()}
        yaExiste={{ numero: 'FAC-00123', href: '/facturas/55' }}
        onRestaurar={onRestaurar}
        onDescartar={onDescartar}
      />,
    );

    expect(screen.getByText(/Esto ya se guardó como/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'FAC-00123' });
    expect(link).toHaveAttribute('href', '/facturas/55');
    expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(onDescartar).toHaveBeenCalledTimes(1);
    expect(onRestaurar).not.toHaveBeenCalled();
  });
});
