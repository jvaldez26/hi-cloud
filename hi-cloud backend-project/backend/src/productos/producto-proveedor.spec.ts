import { BadRequestException } from '@nestjs/common';
import { ProductoProveedorService } from './producto-proveedor.service';

/**
 * Reposición por proveedor — cuánto pedir.
 *
 * Lo que protege este archivo es la aritmética que ve el que compra con el
 * proveedor delante. Un número mal redondeado aquí es un pedido mal hecho.
 */
describe('ProductoProveedorService — cuánto pedir', () => {
  /** Fila cruda como la devuelve la consulta, con los valores por defecto sanos. */
  const fila = (over: Record<string, unknown> = {}) => ({
    vinculoId: 1, productoId: 10, codigo: 'A-1', nombre: 'Tornillo',
    unidadMedida: 'PZA', codigoProveedor: null, esPreferente: false,
    precioPactado: null, monedaPactada: 'DOP', precioPactadoAt: null,
    origen: 'manual', diasEntrega: null,
    pedidoMinimo: null, multiploEmpaque: null,
    existencia: 0, minimo: 0, origenMinimo: 'sin-configurar',
    sugeridaPlan: null,
    ...over,
  });

  const construir = (filas: Record<string, unknown>[]) => {
    const query = jest.fn().mockResolvedValue(filas);
    return new ProductoProveedorService(
      {} as any,
      { query } as any,
      { getEmpresaId: () => 1 } as any,
    );
  };

  const primera = async (over: Record<string, unknown>) => {
    const svc = construir([fila(over)]);
    const [linea] = await svc.listarPorProveedor(5, 3);
    return linea;
  };

  // ── El faltante ───────────────────────────────────────────────────────────

  it('el faltante es el hueco hasta el mínimo', async () => {
    const l = await primera({ existencia: 4, minimo: 10 });
    expect(l.faltante).toBe(6);
    expect(l.cantidadSugerida).toBe(6);
  });

  it('sobre el mínimo no falta nada, y no se sugiere pedir', async () => {
    const l = await primera({ existencia: 30, minimo: 10 });
    expect(l.faltante).toBe(0);
    expect(l.cantidadSugerida).toBe(0);
  });

  it('sin reglas de pedido, la sugerencia es el faltante sin redondear', async () => {
    const l = await primera({ existencia: 0.5, minimo: 3 });
    expect(l.cantidadSugerida).toBe(2.5);
  });

  // ── Las dos reglas, que son distintas ─────────────────────────────────────

  it('pedidoMinimo sube la cantidad hasta lo que el proveedor acepta', async () => {
    const l = await primera({ existencia: 8, minimo: 10, pedidoMinimo: 6 });
    expect(l.faltante).toBe(2);
    expect(l.cantidadSugerida).toBe(6);
  });

  it('multiploEmpaque redondea HACIA ARRIBA al empaque', async () => {
    const l = await primera({ existencia: 0, minimo: 10, multiploEmpaque: 12 });
    expect(l.cantidadSugerida).toBe(12);
  });

  it('un faltante que ya es múltiplo exacto no se infla', async () => {
    const l = await primera({ existencia: 0, minimo: 24, multiploEmpaque: 12 });
    expect(l.cantidadSugerida).toBe(24);
  });

  it('con las dos reglas, primero el mínimo y DESPUÉS el múltiplo', async () => {
    // Al revés daría 4: por debajo del mínimo que el proveedor acepta.
    const l = await primera({ existencia: 0, minimo: 1, pedidoMinimo: 6, multiploEmpaque: 4 });
    expect(l.cantidadSugerida).toBe(8);
  });

  it('las reglas no convierten un "no falta nada" en un pedido', async () => {
    const l = await primera({ existencia: 50, minimo: 10, pedidoMinimo: 6, multiploEmpaque: 12 });
    expect(l.cantidadSugerida).toBe(0);
  });

  // ── La planeación de demanda ──────────────────────────────────────────────

  it('si hay plan de demanda, su cantidad manda sobre el faltante simple', async () => {
    const l = await primera({ existencia: 4, minimo: 10, sugeridaPlan: 40 });
    expect(l.cantidadSugerida).toBe(40);
    expect(l.origenSugerencia).toBe('plan');
  });

  it('el plan también respeta el empaque del proveedor', async () => {
    const l = await primera({ existencia: 0, minimo: 5, sugeridaPlan: 40, multiploEmpaque: 12 });
    expect(l.cantidadSugerida).toBe(48);
  });

  it('un plan en cero no se usa: se cae al faltante', async () => {
    const l = await primera({ existencia: 4, minimo: 10, sugeridaPlan: 0 });
    expect(l.cantidadSugerida).toBe(6);
    expect(l.origenSugerencia).toBe('faltante');
  });

  // ── De dónde sale el mínimo ───────────────────────────────────────────────

  it('la fila dice de qué mínimo habla', async () => {
    // La consulta ya resolvió el COALESCE; aquí se comprueba que el dato viaja
    // hasta la pantalla. Sin él, un faltante 0 por mínimo sin configurar parece
    // "no falta nada" y nadie entiende por qué la pantalla sale vacía.
    for (const origen of ['almacen', 'producto', 'sin-configurar'] as const) {
      const l = await primera({ origenMinimo: origen });
      expect(l.origenMinimo).toBe(origen);
    }
  });

  // ── El precio ─────────────────────────────────────────────────────────────

  it('un precio derivado del historial se marca como estimado', async () => {
    for (const origen of ['backfill', 'compra']) {
      const l = await primera({ origen, precioPactado: '125.50' });
      expect(l.precioEsEstimado).toBe(true);
      expect(l.precioPactado).toBe(125.5);
    }
  });

  it('un precio confirmado por una persona no es estimado', async () => {
    const l = await primera({ origen: 'manual', precioPactado: '125.50' });
    expect(l.precioEsEstimado).toBe(false);
  });

  // ── La moneda de la orden ─────────────────────────────────────────────────

  describe('validarMonedaUnica', () => {
    const conFilas = (filas: any[]) => new ProductoProveedorService(
      { find: jest.fn().mockResolvedValue(filas) } as any,
      {} as any,
      { getEmpresaId: () => 1 } as any,
    );

    it('acepta una sola moneda', async () => {
      const svc = conFilas([
        { id: 1, monedaPactada: 'DOP', precioPactado: 10 },
        { id: 2, monedaPactada: 'DOP', precioPactado: 20 },
      ]);
      await expect(svc.validarMonedaUnica([1, 2])).resolves.toEqual(['DOP']);
    });

    it('rechaza monedas mezcladas en vez de convertir por detrás', async () => {
      const svc = conFilas([
        { id: 1, monedaPactada: 'DOP', precioPactado: 10 },
        { id: 2, monedaPactada: 'USD', precioPactado: 20 },
      ]);
      await expect(svc.validarMonedaUnica([1, 2])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una línea sin precio no impone moneda', async () => {
      const svc = conFilas([
        { id: 1, monedaPactada: 'DOP', precioPactado: 10 },
        { id: 2, monedaPactada: 'USD', precioPactado: null },
      ]);
      await expect(svc.validarMonedaUnica([1, 2])).resolves.toEqual(['DOP']);
    });

    it('sin líneas no valida nada', async () => {
      const svc = conFilas([]);
      await expect(svc.validarMonedaUnica([])).resolves.toEqual([]);
    });
  });

  // ── El almacén ────────────────────────────────────────────────────────────

  it('el almacén llega a la consulta como parámetro, no se ignora', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const svc = new ProductoProveedorService(
      {} as any, { query } as any, { getEmpresaId: () => 7 } as any,
    );
    await svc.listarPorProveedor(5, 42);
    expect(query.mock.calls[0][1]).toEqual([7, 5, 42]);
  });
});

/**
 * Vínculo al crear un producto.
 *
 * Los tres mecanismos de poblado originales —backfill, enganche al recibir
 * compra y alta manual desde reposición— dejaban fuera el alta de producto. Un
 * producto recién creado no se vinculaba a nadie, ni siquiera cuando el
 * proveedor estaba a la vista en el mismo formulario (el modal rápido de la
 * orden de compra).
 */
describe('ProductoProveedorService.vincularAlCrear', () => {
  const construir = (existente: any = null, preferenteExistente: any = null) => {
    const save   = jest.fn(async (x: any) => ({ id: 99, ...x }));
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn((x: any) => x);
    // findOne se llama dos veces: el par existente y luego el preferente activo.
    const findOne = jest.fn()
      .mockResolvedValueOnce(existente)
      .mockResolvedValueOnce(preferenteExistente);

    const svc = new ProductoProveedorService(
      { save, update, create, findOne } as any,
      {} as any,
      { getEmpresaId: () => 1 } as any,
    );
    return { svc, save, update, create, findOne };
  };

  it('crea el par con origen manual', async () => {
    const { svc, save } = construir();
    await expect(svc.vincularAlCrear(10, 5)).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      productoId: 10, proveedorId: 5, origen: 'manual',
    });
  });

  it('el par nace SIN precio — el costo del formulario es un estimado de compra', async () => {
    const { svc, save } = construir();
    await svc.vincularAlCrear(10, 5);
    expect(save.mock.calls[0][0]).toMatchObject({
      precioPactado: null,
      precioPactadoAt: null,
    });
  });

  it('marca preferente cuando el producto no tiene ninguno activo', async () => {
    const { svc, save } = construir(null, null);
    await svc.vincularAlCrear(10, 5);
    expect(save.mock.calls[0][0].esPreferente).toBe(true);
  });

  it('NO marca preferente si el producto ya tiene uno', async () => {
    // La condición es "no tiene preferente activo", no "es el primer proveedor":
    // el enganche de compras crea pares SIN preferente, así que un producto puede
    // tener varios proveedores y ninguno marcado. Con la regla del "primero" esos
    // se quedarían huérfanos para siempre.
    const { svc, save } = construir(null, { id: 7 });
    await svc.vincularAlCrear(10, 5);
    expect(save.mock.calls[0][0].esPreferente).toBe(false);
  });

  it('un par ya activo no se duplica ni se toca', async () => {
    const { svc, save, update } = construir({ id: 3, isActive: true });
    await expect(svc.vincularAlCrear(10, 5)).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('un par desvinculado se reactiva en vez de duplicarse', async () => {
    const { svc, save, update } = construir({ id: 3, isActive: false }, null);
    await expect(svc.vincularAlCrear(10, 5)).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(3, { isActive: true, esPreferente: true });
  });

  it('NO lanza si el vínculo falla — el producto ya está creado', async () => {
    // Bloquear un alta de producto por un dato accesorio entorpecería el
    // mostrador, que es justo lo que se quiere evitar.
    const svc = new ProductoProveedorService(
      { findOne: jest.fn().mockRejectedValue(new Error('BD caída')) } as any,
      {} as any,
      { getEmpresaId: () => 1 } as any,
    );
    await expect(svc.vincularAlCrear(10, 5)).resolves.toBe(false);
  });
});

/**
 * El código del proveedor en el vínculo.
 *
 * Es un campo DISTINTO de `productos.referencia`. Aquel es la referencia interna
 * del negocio y vive en el producto; este lo pone el proveedor, sirve para
 * pedirle, y vive en el par. Mezclarlos fue la ambigüedad que arrastraba el
 * placeholder «Referencia interna o del proveedor».
 */
describe('ProductoProveedorService.vincularAlCrear — codigoProveedor', () => {
  const construir = (existente: any = null, preferenteExistente: any = null) => {
    const save   = jest.fn(async (x: any) => ({ id: 99, ...x }));
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn((x: any) => x);
    const findOne = jest.fn()
      .mockResolvedValueOnce(existente)
      .mockResolvedValueOnce(preferenteExistente);
    const svc = new ProductoProveedorService(
      { save, update, create, findOne } as any,
      {} as any,
      { getEmpresaId: () => 1 } as any,
    );
    return { svc, save, update };
  };

  it('guarda el código en el par nuevo', async () => {
    const { svc, save } = construir();
    await svc.vincularAlCrear(10, 5, 'FC-4471-B');
    expect(save.mock.calls[0][0].codigoProveedor).toBe('FC-4471-B');
  });

  it('sin código, el par nace con null y no con cadena vacía', async () => {
    const { svc, save } = construir();
    await svc.vincularAlCrear(10, 5);
    expect(save.mock.calls[0][0].codigoProveedor).toBeNull();
  });

  it('un campo dejado en blanco no se guarda como código', async () => {
    const { svc, save } = construir();
    await svc.vincularAlCrear(10, 5, '   ');
    expect(save.mock.calls[0][0].codigoProveedor).toBeNull();
  });

  it('sobre un par YA activo, actualiza solo el código', async () => {
    // Editar un producto ya vinculado y corregirle el código del proveedor tiene
    // que funcionar; lo que no puede es re-tocar preferente ni precio.
    const { svc, save, update } = construir({ id: 3, isActive: true, codigoProveedor: 'VIEJO' });
    await expect(svc.vincularAlCrear(10, 5, 'NUEVO')).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(3, { codigoProveedor: 'NUEVO' });
  });

  it('sobre un par ya activo y sin código nuevo, no escribe nada', async () => {
    const { svc, save, update } = construir({ id: 3, isActive: true, codigoProveedor: 'X' });
    await svc.vincularAlCrear(10, 5);
    expect(save).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('el mismo código sobre un par activo no genera escritura', async () => {
    const { svc, update } = construir({ id: 3, isActive: true, codigoProveedor: 'IGUAL' });
    await svc.vincularAlCrear(10, 5, 'IGUAL');
    expect(update).not.toHaveBeenCalled();
  });
});
