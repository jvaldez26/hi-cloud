/**
 * Beep corto y claro (dos tonos, ~350ms) para "autorización pendiente" —
 * generado con Web Audio API en vez de cargar un archivo de audio, así no
 * hace falta un asset binario nuevo y el volumen/duración quedan en código,
 * fáciles de ajustar si resulta molesto.
 *
 * Un solo AudioContext por pestaña (crearlo de nuevo en cada beep acumula
 * contextos "suspended" sin cerrar) — se crea perezoso, en el primer uso,
 * que además es el gesto del usuario que lo desbloquea (ver
 * AutorizacionRemotaSonidoGlobal.tsx).
 */
let ctx: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!ctx) ctx = new AudioContextCtor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tono(audioCtx: AudioContext, frecuencia: number, inicioSeg: number, duracionSeg: number): void {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frecuencia;
  const t0 = audioCtx.currentTime + inicioSeg;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + duracionSeg);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duracionSeg);
}

/** true si pudo intentar reproducir (contexto disponible) — no garantiza que se oyera. */
export function reproducirBeepAutorizacion(): boolean {
  const audioCtx = obtenerContexto();
  if (!audioCtx) return false;
  tono(audioCtx, 880, 0, 0.15);
  tono(audioCtx, 1175, 0.18, 0.18);
  return true;
}
