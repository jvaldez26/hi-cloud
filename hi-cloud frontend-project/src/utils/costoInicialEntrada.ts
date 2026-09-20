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
  return costo > 0 ? costo : undefined;
}
