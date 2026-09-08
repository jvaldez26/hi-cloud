/**
 * Cuadrado, sobrante o faltante — la única decisión de las tres.
 *
 * Existía repetida en cinco sitios de CajaPage y uno se escribió `v === 0`.
 * `cierres_caja.diferencia` es `decimal(12,2)`, y una columna decimal llega por
 * TypeORM/pg como **cadena**: `"0.00"`. `"0.00" === 0` es `false`, así que una
 * caja cuadrada caía en la rama del faltante y se pintaba en ROJO. Lo peor es
 * que la comparación de al lado, `v > 0`, sí funciona —el `>` convierte la
 * cadena y el `===` no—, así que el fallo se esconde entre dos líneas que
 * parecen iguales. Y la firma del render dice `v: number`, de modo que `tsc` no
 * tenía nada que objetar.
 *
 * Aquí se convierte una vez y se compara sobre el número.
 */

export type EstadoDiferencia = 'cuadrado' | 'sobrante' | 'faltante';

/**
 * Medio centavo de tolerancia: la columna guarda dos decimales, así que por
 * debajo de eso no hay diferencia que un cajero pueda contar.
 *
 * No es cosmética. El modal de cierre calcula la diferencia restando dos
 * importes en coma flotante, y esa resta devuelve cosas como 1.8189894e-12
 * cuando el arqueo cuadra exactamente. Sin la tolerancia, el modal anunciaba
 * «↓ Faltante RD$0.00» justo en el momento en que el cajero decide si cierra.
 */
const MEDIO_CENTAVO = 0.005;

export function estadoDiferencia(valor: unknown): EstadoDiferencia {
  const n = Number(valor);
  // Un valor que no es número no se pinta como faltante: `fmt.money` ya lo
  // muestra como RD$0.00, y un rojo sobre un cero desmiente lo que se lee.
  if (!Number.isFinite(n) || Math.abs(n) < MEDIO_CENTAVO) return 'cuadrado';
  return n > 0 ? 'sobrante' : 'faltante';
}
