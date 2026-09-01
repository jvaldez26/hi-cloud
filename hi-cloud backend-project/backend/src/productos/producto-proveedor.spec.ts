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
