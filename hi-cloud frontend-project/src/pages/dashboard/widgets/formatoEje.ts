/**
 * Etiqueta corta de importe para los ejes.
 *
 * ── Por qué no vale dividir siempre entre mil ───────────────────────────────
 * La versión anterior era `${(v / 1000).toFixed(0)}K` para todo, y fallaba en
 * los dos extremos de la cartera de clientes, que existen los dos:
 *
 *   RD$500       → «1K»      redondeaba HACIA ARRIBA. El colmado que factura
 *                            quinientos pesos en un mes veía mil.
 *   RD$1,200,000 → «1200K»   nadie escribe eso. Son 1.2M.
 *
 * Ahora la unidad la decide la magnitud. Los decimales también: por debajo de
 * 10K un decimal distingue 1.5K de 2K, y por encima sobra y solo mete ruido en
 * un eje que tiene que leerse de un vistazo.
 *
 * Los negativos conservan el signo — hay gráficas de saldo que bajan de cero.
 */
export const ejeMonto = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return '0';

  const signo = v < 0 ? '-' : '';
  const abs   = Math.abs(v);

  // Por debajo de mil se enseña el número tal cual: convertirlo a «0K» o «1K»
  // es perder justo la información que esa gráfica tiene.
  if (abs < 1_000) return `${signo}${Math.round(abs)}`;

  const [valor, sufijo] = abs >= 1_000_000
    ? [abs / 1_000_000, 'M']
    : [abs / 1_000,     'K'];

  // Un decimal solo mientras aporte: 1.2M sí, 145.0K no.
  const texto = valor < 10
    ? valor.toFixed(1).replace(/\.0$/, '')
    : String(Math.round(valor));

  return `${signo}${texto}${sufijo}`;
};
