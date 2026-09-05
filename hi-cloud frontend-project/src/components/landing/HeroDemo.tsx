/**
 * HeroDemo — la mini demo visual del producto que reemplaza al mockup
 * estático en el hero. Vive SOLO aquí: no toca ProductShot.tsx ni sus otros
 * cuatro usos en SolutionShowcase.
 *
 * Cuenta la misma historia siempre, con dos sets de datos alternos (ya
 * existentes en landing-content.ts, sin copy comercial nuevo — ver el
 * comentario junto a DATASETS más abajo):
 *
 *   Caja 1 · Turno abierto
 *     → aparecen los importes
 *     → se calcula el total
 *     → "Generando E31…"
 *     → "Enviando a DGII…"
 *     → "E31 · ACEPTADO" (un solo pulso, no un loop de brillo)
 *     → "Venta completada"
 *     → arranca una operación nueva
 *
 * ── Por qué NO es un setInterval por frame ──────────────────────────────────
 * Es una máquina de estados: un índice de fase que avanza con UN setTimeout
 * encadenado por transición (7 por vuelta de ~7.7s), no un tick continuo. El
 * contenido de cada fase se resuelve por CSS (transition con transition-delay
 * por fila, para el efecto de aparición escalonada) — React solo decide QUÉ
 * fase está activa, nunca anima él mismo.
 *
 * ── Por qué nada se desmonta entre fases ────────────────────────────────────
 * Las filas, el total y el meta están SIEMPRE en el DOM; lo que cambia es su
 * opacidad/transform vía clase. Así la tarjeta nunca cambia de alto entre
 * fases — cero layout shift, que es justo el riesgo de ir agregando y
 * quitando nodos.
 *
 * ── Pausa ────────────────────────────────────────────────────────────────
 * Un IntersectionObserver + el evento visibilitychange paran el avance de
 * fases (no el DOM) cuando el hero no es visible o la pestaña está en
 * segundo plano. Con prefers-reduced-motion, el ciclo ni siquiera arranca:
 * se queda fijo en "ACEPTADO", que es el fotograma más informativo completo.
 */
import { useEffect, useRef, useState } from 'react';
import { HERO_SHOT, SOLUTION_SHOWCASES, type ShotRow } from '../../config/landing-content';

// ── Accesibilidad: mismo patrón que SkeletonTabla.tsx / MensajeNotificador.tsx ──
function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

interface DemoDataset {
  rows: ShotRow[];
  totalLabel: string;
  total: string;
  meta: string;
}

// Dos "operaciones" alternas para que la segunda vuelta del ciclo no repita
// los mismos importes — ambas ya existen en landing-content.ts:
//   · Lap 0: el mismo HERO_SHOT que se mostraba estático hasta ahora.
//   · Lap 1: los importes del showcase de retail (SOLUTION_SHOWCASES[0]).
// El único texto que NO estaba ya en el archivo es el e-NCF de la segunda
// vuelta ('E310000000148' — una unidad más que el de HERO_SHOT, incluido en
// el resumen de cambios para que quede a la vista).
const retailShot = SOLUTION_SHOWCASES.find(s => s.id === 'retail')!.shot;
const DATASETS: DemoDataset[] = [
  {
    rows: HERO_SHOT.rows,
    totalLabel: HERO_SHOT.totalLabel,
    total: HERO_SHOT.total,
    meta: HERO_SHOT.meta,
  },
  {
    rows: retailShot.rows,
    totalLabel: retailShot.totalLabel ?? HERO_SHOT.totalLabel,
    total: retailShot.total ?? HERO_SHOT.total,
    meta: 'e-NCF E310000000148 · RNC 130-12345-6',
  },
];

interface Fase {
  id: string;
  duracionMs: number;
  filas: boolean;
  total: boolean;
  chip: string | null;
  chipEstado: 'wait' | 'ok' | null;
  meta: string | null;
  pulso: boolean;
}

function construirFases(meta: string): Fase[] {
  return [
    { id: 'turno',      duracionMs: 500,  filas: false, total: false, chip: null,                     chipEstado: null,   meta: null, pulso: false },
    { id: 'vendiendo',  duracionMs: 1500, filas: true,  total: false, chip: null,                     chipEstado: null,   meta: null, pulso: false },
    { id: 'calculando', duracionMs: 700,  filas: true,  total: true,  chip: null,                     chipEstado: null,   meta: null, pulso: false },
    { id: 'generando',  duracionMs: 900,  filas: true,  total: true,  chip: 'Generando E31…',         chipEstado: 'wait', meta: null, pulso: false },
    { id: 'enviando',   duracionMs: 1000, filas: true,  total: true,  chip: 'Enviando a DGII…',       chipEstado: 'wait', meta: null, pulso: false },
    { id: 'aceptado',   duracionMs: 2200, filas: true,  total: true,  chip: 'E31 · ACEPTADO',         chipEstado: 'ok',   meta,       pulso: true  },
    { id: 'completada', duracionMs: 900,  filas: true,  total: true,  chip: 'E31 · ACEPTADO',         chipEstado: 'ok',   meta: `Venta completada · ${meta}`, pulso: false },
  ];
}

// Índice de la fase "aceptado" — el fotograma en el que se congela con
// prefers-reduced-motion: venta completa, total resuelto, e-CF aceptado.
const FASE_CONGELADA = 5;

export default function HeroDemo() {
  const reducirMovimiento = usePrefersReducedMotion();
  const contenedorRef = useRef<HTMLDivElement>(null);

  const [lap, setLap]           = useState(0);
  const [faseIdx, setFaseIdx]   = useState(0);
  const [pausado, setPausado]   = useState(false);

  const dataset = DATASETS[lap];
  const fases   = construirFases(dataset.meta);
  const faseActual = reducirMovimiento ? fases[FASE_CONGELADA] : fases[faseIdx];

  // ── Pausa: fuera del viewport o pestaña oculta ────────────────────────────
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let visible = true;
    const actualizar = () => setPausado(!visible || document.hidden);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      actualizar();
    }, { threshold: 0.2 });
    observer.observe(el);

    document.addEventListener('visibilitychange', actualizar);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', actualizar);
    };
  }, []);

  // ── Avance de fases — un setTimeout por transición, nunca un tick continuo ──
  useEffect(() => {
    if (reducirMovimiento) return; // el ciclo ni arranca: fotograma fijo
    if (pausado) return;           // no se agenda el siguiente paso mientras está en pausa

    const id = setTimeout(() => {
      setFaseIdx(i => {
        const siguiente = (i + 1) % fases.length;
        if (siguiente === 0) setLap(l => 1 - l); // alterna el set de datos cada vuelta
        return siguiente;
      });
    }, fases[faseIdx].duracionMs);

    return () => clearTimeout(id);
    // fases.length es constante (7); reconstruir `fases` en cada render por el
    // meta dinámico no cambia su forma, así que no hace falta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseIdx, pausado, reducirMovimiento]);

  return (
    <div
      ref={contenedorRef}
      className="hcl-shot hcl-demo"
      role="img"
      aria-label="Demostración del punto de venta de HiCloud: se registra una venta, se calcula el total, se emite el comprobante fiscal electrónico y la DGII lo acepta, sin interrumpir la venta"
    >
      <div className="hcl-shot-bar">
        <i /><i /><i />
        <span>{HERO_SHOT.url}</span>
      </div>

      <div className="hcl-shot-body" aria-hidden="true">
        <div className="hcl-shot-head">
          <span className="hcl-chip"><span className="hcl-dot" />{HERO_SHOT.chipLeft}</span>
          <span
            className={[
              'hcl-chip',
              'hcl-demo-chip-right',
              faseActual.chipEstado === 'ok' ? 'hcl-chip--ok' : '',
              faseActual.chipEstado === 'wait' ? 'hcl-chip--wait' : '',
              faseActual.pulso ? 'hcl-chip--pulse' : '',
              faseActual.chip ? 'is-visible' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="hcl-dot" />{faseActual.chip ?? '·'}
          </span>
        </div>

        <div className={`hcl-demo-rows${faseActual.filas ? ' is-visible' : ''}`}>
          {dataset.rows.map((r, i) => (
            <div className="hcl-sk-row hcl-demo-row" style={{ transitionDelay: `${i * 140}ms` }} key={i}>
              <span className={`hcl-sk hcl-sk--${r.width}`} />
              <span className="hcl-sk-amount">{r.amount}</span>
            </div>
          ))}
        </div>

        <div className={`hcl-shot-total hcl-demo-fade${faseActual.total ? ' is-visible' : ''}`}>
          <span className="hcl-shot-total-label">{dataset.totalLabel}</span>
          <b>{dataset.total}</b>
        </div>

        <div className={`hcl-shot-meta hcl-demo-fade${faseActual.meta ? ' is-visible' : ''}`}>
          {faseActual.meta ?? ' '}
        </div>
      </div>
    </div>
  );
}
