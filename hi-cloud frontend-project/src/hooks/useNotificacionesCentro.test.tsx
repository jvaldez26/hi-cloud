import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvisoAutorizacionRemota, type ItemCentro } from './useNotificacionesCentro';

/**
 * Bug real (2026-10-17): el toast de "autorización solicitada" mostraba
 * "⚠️ Nuevo aviso crítico" / "Bsndj — vence en 3 minutos." — genérico para
 * CUALQUIER aviso crítico, sin botón ni forma de responder desde ahí. Este
 * componente es el cuerpo específico que useNotificacionesCentro.tsx monta
 * SOLO para tipo==='autorizacion_remota_solicitada': countdown en vivo +
 * un único botón ("Ver y responder") — aprobar/rechazar vive en
 * SolicitudesAutorizacionPage, nunca aquí.
 */
function item(overrides: Partial<ItemCentro> = {}): ItemCentro {
  return {
    id: 'evento-1', origen: 'evento', tipo: 'autorizacion_remota_solicitada', prioridad: 0,
    titulo: 'Autorización solicitada: Venta a crédito',
    descripcion: 'Adalberta Reyes (Sucursal Piantini) — RD$ 4,500.00 a Juan Pérez · Motivo: "cliente frecuente"',
    ruta: '/autorizacion-remota?id=42', emoji: '🔔',
    fecha: new Date().toISOString(), atendido: false,
    ...overrides,
  };
}

describe('AvisoAutorizacionRemota', () => {
  it('muestra el cuerpo específico (cajero, sucursal, monto, cliente, motivo)', () => {
    render(<AvisoAutorizacionRemota item={item()} onVer={() => {}} />);
    expect(screen.getByText(/Adalberta Reyes/)).toBeInTheDocument();
    expect(screen.getByText(/RD\$ 4,500\.00 a Juan Pérez/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo: "cliente frecuente"/)).toBeInTheDocument();
  });

  it('muestra una cuenta regresiva viva, no un texto estático de "vence en 3 minutos"', () => {
    render(<AvisoAutorizacionRemota item={item()} onVer={() => {}} />);
    expect(screen.getByText(/Vence en \d:\d{2}/)).toBeInTheDocument();
  });

  it('una solicitud ya vencida (fecha hace más de 3 min) muestra "Vencida"', () => {
    const vieja = item({ fecha: new Date(Date.now() - 4 * 60_000).toISOString() });
    render(<AvisoAutorizacionRemota item={vieja} onVer={() => {}} />);
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });

  it('"Ver y responder" llama a onVer — nunca aprueba/rechaza desde aquí', () => {
    const onVer = vi.fn();
    render(<AvisoAutorizacionRemota item={item()} onVer={onVer} />);
    expect(screen.queryByText(/Aprobar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rechazar/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver y responder'));
    expect(onVer).toHaveBeenCalledTimes(1);
  });
});
