import { esFormatoTarjetaSupervisor } from '../../utils/tarjetaSupervisor';

export const ESPERA_AUTOENVIO_MS = 150;

/**
 * Envío automático del campo de escaneo de tarjeta de supervisor: dispara
 * sola a los ~150ms sin nuevas teclas, SOLO si el valor ya tiene el formato
 * exacto de tarjeta (nunca depende de que el escáner mande Enter). Un Enter
 * manual también pasa por aquí, y la bandera "enviado" asegura que, si el
 * debounce y el Enter caen casi juntos, solo el primero en llegar dispara —
 * el otro se descarta en vez de mandar una segunda petición.
 */
export class AutoEnvioTarjeta {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enviado = false;

  constructor(
    private readonly enviar: (valor: string) => void,
    private readonly esperaMs: number = ESPERA_AUTOENVIO_MS,
  ) {}

  /** Llamar en cada cambio del campo (onChange). */
  alCambiar(valor: string): void {
    this.cancelarTimer();
    if (esFormatoTarjetaSupervisor(valor)) {
      this.timer = setTimeout(() => this.intentarEnviar(valor), this.esperaMs);
    }
  }

  /** Llamar en Enter manual — intenta de inmediato, con o sin formato exacto. */
  alEnter(valor: string): void {
    this.cancelarTimer();
    this.intentarEnviar(valor);
  }

  /** Llamar cuando la petición termina (éxito o error), para permitir el siguiente escaneo. */
  reset(): void {
    this.cancelarTimer();
    this.enviado = false;
  }

  private cancelarTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private intentarEnviar(valor: string): void {
    if (this.enviado || !valor.trim()) return;
    this.enviado = true;
    this.enviar(valor);
  }
}

/** "90123456789012345678901234" → "•••• 1234" — nunca el código completo. */
export function enmascararCodigoTarjeta(valor: string): string {
  if (!valor) return '';
  return `•••• ${valor.slice(-4)}`;
}
