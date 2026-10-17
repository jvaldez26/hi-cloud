/**
 * Costo a pre-llenar en "Costo unitario" del modal Registrar Entrada
 * (InventarioPage) al elegir un producto — undefined cuando el producto no
 * tiene costoPromedio conocido, así el campo queda vacío exactamente como si
 * el usuario no supiera el costo (mismo comportamiento que hoy, sin AVCO).
 * Editable: es solo el valor inicial, no un mínimo ni un máximo.
 */
export function costoParaPrellenar(
  producto: { costoPromedio?: number | string | null } | undefined | null,
): number | undefined {
  const costo = Number(producto?.costoPromedio ?? 0);
  if (!(costo > 0)) return undefined;
  // costoPromedio vive en BD con 4 decimales (AVCO — numeric(14,4)), pero
  // RegistrarEntradaDto.costoUnitario solo acepta 2 (maxDecimalPlaces: 2).
  // Sin este redondeo, un producto con un promedio real de 4 decimales
  // (p.ej. 95.5833) prellenaba el campo con ese valor exacto, y si el
  // usuario lo dejaba tal cual y enviaba, el backend respondía 400
  // "costoUnitario must be a number conforming to the specified constraints"
  // — caso real: Elvia Aquino, 17/10/2026.
  return Math.round(costo * 100) / 100;
}
