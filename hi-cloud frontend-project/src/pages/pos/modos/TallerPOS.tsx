import type { ModoPOSProps } from './types';

export default function TallerPOS({ palette }: ModoPOSProps) {
  const C = palette;
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 56 }}>🔧</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Modo Taller</div>
      <div style={{ fontSize: 13, color: C.textSub }}>Panel en desarrollo — próximamente disponible</div>
    </div>
  );
}
