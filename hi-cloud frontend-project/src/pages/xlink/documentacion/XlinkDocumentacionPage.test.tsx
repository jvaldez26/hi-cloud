import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import XlinkDocumentacionPage from './XlinkDocumentacionPage';
import { SECCIONES } from './contenido';
import { ProtectedRoute } from '../../../App';
import { useAuthStore } from '../../../store/auth.store';

// jsdom no trae IntersectionObserver — la página lo usa solo para resaltar la
// sección activa del índice mientras se hace scroll, algo que estos tests no
// ejercitan (no hay scroll real en jsdom), así que basta un mock inerte.
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = IntersectionObserverMock;

function montar() {
  return render(
    <MemoryRouter initialEntries={['/xlink/documentacion']}>
      <XlinkDocumentacionPage />
    </MemoryRouter>,
  );
}

describe('XlinkDocumentacionPage', () => {
  // El componente lee window.location.hash directamente (no el hash de
  // MemoryRouter, que vive en una historia en memoria aparte) — es el mismo
  // window.location real que usa BrowserRouter en producción. Se resetea
  // entre tests porque es un global compartido.
  afterEach(() => { window.location.hash = ''; });

  it('renderiza todas las secciones del contenido', () => {
    const { container } = montar();
    for (const s of SECCIONES) {
      expect(container.querySelector(`#${s.id}`)).toBeInTheDocument();
    }
  });

  it('el índice tiene un enlace por sección, en el mismo orden', () => {
    montar();
    // aria-label propio — el título de cada sección aparece DOS veces en el
    // DOM (el ítem del índice y el <Title> de la sección misma), así que no
    // se puede ubicar el <nav> por su texto.
    const nav = screen.getByRole('navigation', { name: 'Índice de la documentación' });
    const items = within(nav).getAllByText((_, el) => SECCIONES.some(s => s.titulo === el?.textContent));
    expect(items.length).toBe(SECCIONES.length);
    items.forEach((el, i) => expect(el.textContent).toBe(SECCIONES[i].titulo));
  });

  it('un clic en el índice hace scroll a su sección (hash de la URL actualizado)', async () => {
    const user = userEvent.setup();
    const { container } = montar();
    const destino = SECCIONES[4]; // "5. Homologación" — no es ni la primera ni la última
    const scrollSpy = vi.spyOn(container.querySelector(`#${destino.id}`) as HTMLElement, 'scrollIntoView');
    const nav = screen.getByRole('navigation', { name: 'Índice de la documentación' });

    await user.click(within(nav).getByText(destino.titulo));

    expect(scrollSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe(`#${destino.id}`);
  });

  it('abrir la ruta con un hash en la URL hace scroll a esa sección al montar', async () => {
    const destino = SECCIONES[6]; // "7. Protecciones"
    // El componente lee window.location.hash tal cual llega — se fija ANTES
    // de montar, igual que el navegador real lo haría al abrir la URL con
    // hash (MemoryRouter no propaga el hash de initialEntries al window real).
    window.location.hash = `#${destino.id}`;

    const { container } = montar();
    const el = container.querySelector(`#${destino.id}`) as HTMLElement;
    const scrollSpy = vi.spyOn(el, 'scrollIntoView').mockImplementation(() => {});

    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    expect(scrollSpy).toHaveBeenCalled();
  });
});

describe('XlinkDocumentacionPage — acceso', () => {
  const estadoOriginal = useAuthStore.getState();
  afterEach(() => useAuthStore.setState(estadoOriginal, true));

  it('sin sesión (ProtectedRoute): no entra a la documentación, se redirige', () => {
    useAuthStore.setState({ user: null, hydrated: true } as any);

    render(
      <MemoryRouter initialEntries={['/xlink/documentacion']}>
        <ProtectedRoute>
          <XlinkDocumentacionPage />
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Documentación de HiCloud Xlink')).not.toBeInTheDocument();
  });

  it('con sesión de empresa (admin): sí entra', () => {
    useAuthStore.setState({
      user: { id: 1, nombre: 'Jean', role: 'admin' } as any,
      hydrated: true,
    } as any);

    render(
      <MemoryRouter initialEntries={['/xlink/documentacion']}>
        <ProtectedRoute>
          <XlinkDocumentacionPage />
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText('Documentación de HiCloud Xlink')).toBeInTheDocument();
  });
});
