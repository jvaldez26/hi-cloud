import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFlyoutSidebar, RETARDO_CIERRE_MS } from './useFlyoutSidebar';

/**
 * El flyout del sidebar colapsado: hover entre íconos sin clics, retardo para
 * cruzar al panel, fijar por clic, y —lo que no se puede ver a ojo— que un toque
 * en una laptop táctil no abra y cierre el menú en el mismo gesto.
 */

/** Evento de puntero mínimo: lo único que el hook lee. */
const ev = (pointerType: 'mouse' | 'touch' | 'pen', top = 100) => ({
  pointerType,
  currentTarget: { getBoundingClientRect: () => ({ top }) },
}) as any;

function montar(activo = true) {
  const sidebar = document.createElement('div');
  const fuera   = document.createElement('div');
  document.body.append(sidebar, fuera);
  const sidebarRef = { current: sidebar };
  const r = renderHook(({ activo }) => useFlyoutSidebar({ activo, sidebarRef }), {
    initialProps: { activo },
  });
  // El panel real es hermano del sidebar, no hijo: se replica aquí porque es
  // exactamente la razón del fallo latente del clic-afuera.
  const panel = document.createElement('div');
  const itemDelPanel = document.createElement('button');
  panel.append(itemDelPanel);
  document.body.append(panel);
  r.result.current.panelRef.current = panel;
  return { ...r, sidebar, fuera, panel, itemDelPanel };
}

const pulsar = (el: Element) =>
  act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });

describe('useFlyoutSidebar', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('el hover con ratón abre el menú de ese ícono, sin clic', () => {
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse', 120)));
    expect(result.current.panel).toEqual({ id: 'ventas', top: 120, fijado: false });
  });

  it('pasar a otro ícono cambia de menú al instante, con uno ya abierto', () => {
    // Lo que no funcionaba: con un flyout abierto, el overlay tapaba la barra.
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse')));
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('mouse')));
    act(() => result.current.hoverIcono('compras').onPointerEnter(ev('mouse', 200)));
    expect(result.current.panel?.id).toBe('compras');
    // Y el cierre pendiente del anterior no se lo lleva por delante.
    act(() => { vi.advanceTimersByTime(RETARDO_CIERRE_MS * 3); });
    expect(result.current.panel?.id).toBe('compras');
  });

  it('al salir espera el retardo antes de cerrar', () => {
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse')));
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('mouse')));
    act(() => { vi.advanceTimersByTime(RETARDO_CIERRE_MS - 10); });
    expect(result.current.panel).not.toBeNull();
    act(() => { vi.advanceTimersByTime(20); });
    expect(result.current.panel).toBeNull();
  });

  it('cruzar del ícono al panel no lo cierra', () => {
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse')));
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('mouse')));
    act(() => { vi.advanceTimersByTime(80); });                    // en el trayecto
    act(() => result.current.hoverPanel.onPointerEnter(ev('mouse')));
    act(() => { vi.advanceTimersByTime(RETARDO_CIERRE_MS * 5); });
    expect(result.current.panel?.id).toBe('ventas');
  });

  it('con ratón, el clic fija el menú: sacar el cursor ya no lo cierra', () => {
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse')));
    act(() => result.current.clicEnIcono('ventas', 100));
    expect(result.current.panel?.fijado).toBe(true);
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('mouse')));
    act(() => { vi.advanceTimersByTime(RETARDO_CIERRE_MS * 5); });
    expect(result.current.panel?.id).toBe('ventas');
    // Otro clic lo cierra.
    act(() => result.current.clicEnIcono('ventas', 100));
    expect(result.current.panel).toBeNull();
  });

  it('LAPTOP TÁCTIL: un toque abre el menú y no lo cierra en el mismo gesto', () => {
    // El caso híbrido. Con matchMedia('(hover: hover)') esta laptop diría que
    // tiene hover: el toque abriría por hover y el click lo cerraría al acto.
    // Un toque emite pointerenter con pointerType 'touch' y después el click.
    const { result } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('touch')));
    expect(result.current.panel).toBeNull();                         // el hover no actúa
    act(() => result.current.clicEnIcono('ventas', 100));
    expect(result.current.panel).toEqual({ id: 'ventas', top: 100, fijado: true });
    // Ni el pointerleave del dedo al levantarse lo cierra.
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('touch')));
    act(() => { vi.advanceTimersByTime(RETARDO_CIERRE_MS * 5); });
    expect(result.current.panel?.id).toBe('ventas');
  });

  it('en táctil, tocar el mismo ícono otra vez lo cierra; otro, cambia', () => {
    const { result } = montar();
    act(() => result.current.clicEnIcono('ventas', 100));
    act(() => result.current.clicEnIcono('compras', 200));
    expect(result.current.panel).toEqual({ id: 'compras', top: 200, fijado: true });
    act(() => result.current.clicEnIcono('compras', 200));
    expect(result.current.panel).toBeNull();
  });

  it('un clic DENTRO del panel no cuenta como afuera', () => {
    // El fallo latente: el panel es hermano del sidebar, y la comprobación
    // vieja solo miraba el sidebar. Funcionaba porque la animación de salida
    // dejaba el panel 140 ms en pantalla.
    const { result, itemDelPanel } = montar();
    act(() => result.current.clicEnIcono('ventas', 100));
    pulsar(itemDelPanel);
    expect(result.current.panel?.id).toBe('ventas');
  });

  it('un clic en la barra tampoco lo cierra; uno afuera, sí', () => {
    const { result, sidebar, fuera } = montar();
    act(() => result.current.clicEnIcono('ventas', 100));
    pulsar(sidebar);
    expect(result.current.panel?.id).toBe('ventas');
    pulsar(fuera);
    expect(result.current.panel).toBeNull();
  });

  it('Escape lo cierra', () => {
    const { result } = montar();
    act(() => result.current.clicEnIcono('ventas', 100));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.panel).toBeNull();
  });

  it('al expandir el sidebar se cierra', () => {
    const { result, rerender } = montar(true);
    act(() => result.current.clicEnIcono('ventas', 100));
    rerender({ activo: false });
    expect(result.current.panel).toBeNull();
  });

  it('desmontar con un cierre pendiente no deja el timer colgando', () => {
    const { result, unmount } = montar();
    act(() => result.current.hoverIcono('ventas').onPointerEnter(ev('mouse')));
    act(() => result.current.hoverIcono('ventas').onPointerLeave(ev('mouse')));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
