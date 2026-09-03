import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Desmonta lo renderizado entre tests: si no, el segundo test encuentra dos
// veces cada elemento y los getBy* fallan con un mensaje que no dice por qué.
afterEach(() => cleanup());

// ── Lo que jsdom no trae y antd da por hecho ────────────────────────────────
// Sin matchMedia, cualquier componente responsive de antd revienta al montar.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),      // deprecado, pero antd v5 aún lo consulta
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Los Select y Modal de antd miden el nodo con ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

// jsdom no implementa scrollIntoView y rc-select lo llama al abrir el desplegable
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
