/**
 * ValoracionStockService.actualizarCostoPromedio() — aritmética AVCO real.
 *
 * No existía ningún test directo de este método (compras-avco.spec.ts solo
 * verifica que se LLAME con los argumentos correctos, con la implementación
 * mockeada por completo). Este cubre la fórmula en sí, incluyendo el bug de
 * orden ya corregido: antes, los dos callers en compras.service.ts llamaban
 * a registrarEntrada() (que YA persiste el stock nuevo) antes de este
 * método, que releía producto.stock por su cuenta — para ese punto el stock
 * ya venía contaminado con la entrada recién aplicada. Ahora stockAntes lo
 * manda el caller explícito (el cantidadAnterior que registrarEntrada() ya
 * calculaba) y el método nunca lo vuelve a leer.
 */

import { ValoracionStockService } from './valoracion-stock.service';

function makeService(producto: { costoPromedio: number } | null) {
  const prodRepo = {
    findOne: jest.fn().mockResolvedValue(producto),
    update:  jest.fn().mockResolvedValue({}),
  };
  const svc: any = Object.create(ValoracionStockService.prototype);
  svc.prodRepo = prodRepo;
  return { svc: svc as ValoracionStockService, prodRepo };
}

describe('ValoracionStockService.actualizarCostoPromedio()', () => {
  it('con stock previo real: promedio ponderado clásico (S·C + Y·Z) / (S+Y)', async () => {
    const { svc, prodRepo } = makeService({ costoPromedio: 5 });
    // stockAntes=10, costoActual=5, cantidadNueva=10, costoNuevo=15 → (10*5+10*15)/20 = 10
    await svc.actualizarCostoPromedio(1, 10, 10, 15);
    expect(prodRepo.update).toHaveBeenCalledWith(1, { costoPromedio: 10 });
  });

  it('producto con costo manual (sin stock previo real): la primera compra REEMPLAZA, no promedia', async () => {
    // Este es el caso central de "fijar el costo manualmente": stock=0,
    // costoPromedio=X puesto a mano por el usuario. Al llegar la primera
    // compra real, el resultado debe ser EXACTAMENTE el costo de esa
    // compra — no un 50/50 con el valor manual (ese era el bug).
    const { svc, prodRepo } = makeService({ costoPromedio: 999 }); // valor manual, irrelevante aquí
    await svc.actualizarCostoPromedio(1, /* stockAntes */ 0, /* cantidadNueva */ 20, /* costoNuevo */ 42);
    expect(prodRepo.update).toHaveBeenCalledWith(1, { costoPromedio: 42 });
  });

  it('stockAntes negativo (no debería pasar, pero por seguridad) también reemplaza en vez de dividir por algo raro', async () => {
    const { svc, prodRepo } = makeService({ costoPromedio: 5 });
    await svc.actualizarCostoPromedio(1, -1, 10, 20);
    expect(prodRepo.update).toHaveBeenCalledWith(1, { costoPromedio: 20 });
  });

  it('producto no encontrado: no hace nada (no explota)', async () => {
    const { svc, prodRepo } = makeService(null);
    await svc.actualizarCostoPromedio(999, 10, 5, 20);
    expect(prodRepo.update).not.toHaveBeenCalled();
  });

  it('redondea a 4 decimales', async () => {
    const { svc, prodRepo } = makeService({ costoPromedio: 3.3333 });
    // (7*3.3333 + 3*10) / 10 = 5.33331
    await svc.actualizarCostoPromedio(1, 7, 3, 10);
    expect(prodRepo.update).toHaveBeenCalledWith(1, { costoPromedio: 5.3333 });
  });
});
