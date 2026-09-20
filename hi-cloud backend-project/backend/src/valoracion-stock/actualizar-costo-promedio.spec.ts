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
 *
 * COSTO DE VENTA COMMIT 1 (2026-09-20) — el método pasó de
 * prodRepo.findOne()/update() a una transacción con SELECT ... FOR UPDATE
 * sobre SQL crudo (mismo patrón que caja.service.ts/cosechas.service.ts),
 * agregando aislamiento por empresaId. Estos tests se adaptaron a esa forma
 * y se agregaron 2 nuevos: producto de otra empresa (mock) y concurrencia
 * real con BD (requiere DB_HOST, ver abajo).
 */

import { ValoracionStockService } from './valoracion-stock.service';

function makeService(producto: { id: number; costoPromedio: string } | null, empresaId = 7) {
  const manager = {
    query: jest.fn((sql: string, params: unknown[]) => {
      if (sql.trim().startsWith('SELECT')) {
        return Promise.resolve(producto ? [producto] : []);
      }
      return Promise.resolve();
    }),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => Promise<void>) => cb(manager)),
  };
  const tenantSvc = { getEmpresaId: () => empresaId };
  const svc: any = Object.create(ValoracionStockService.prototype);
  svc.dataSource = dataSource;
  svc.tenantSvc  = tenantSvc;
  return { svc: svc as ValoracionStockService, manager };
}

/** Extrae [sql, params] de la llamada N a manager.query() (0-based). */
function llamada(manager: { query: jest.Mock }, n: number): [string, unknown[]] {
  const call = manager.query.mock.calls[n];
  return [call[0] as string, call[1] as unknown[]];
}

describe('ValoracionStockService.actualizarCostoPromedio()', () => {
  it('con stock previo real: promedio ponderado clásico (S·C + Y·Z) / (S+Y)', async () => {
    const { svc, manager } = makeService({ id: 1, costoPromedio: '5' });
    // stockAntes=10, costoActual=5, cantidadNueva=10, costoNuevo=15 → (10*5+10*15)/20 = 10
    await svc.actualizarCostoPromedio(1, 10, 10, 15);
    const [sql, params] = llamada(manager, 1); // 0=SELECT FOR UPDATE, 1=UPDATE
    expect(sql).toContain('UPDATE productos');
    expect(params).toEqual([10, 1]);
  });

  it('producto con costo manual (sin stock previo real): la primera compra REEMPLAZA, no promedia', async () => {
    // Este es el caso central de "fijar el costo manualmente": stock=0,
    // costoPromedio=X puesto a mano por el usuario. Al llegar la primera
    // compra real, el resultado debe ser EXACTAMENTE el costo de esa
    // compra — no un 50/50 con el valor manual (ese era el bug).
    const { svc, manager } = makeService({ id: 1, costoPromedio: '999' }); // valor manual, irrelevante aquí
    await svc.actualizarCostoPromedio(1, /* stockAntes */ 0, /* cantidadNueva */ 20, /* costoNuevo */ 42);
    const [, params] = llamada(manager, 1);
    expect(params).toEqual([42, 1]);
  });

  // ── FIX — entrada sin costo conocido no diluye AVCO (2026-09-20) ────────

  it('costoActual=0 con stockAntes>0 (stock sin costo conocido): la Compra REEMPLAZA, no promedia', async () => {
    // El caso real: 4 unidades entraron por "Stock inicial al crear
    // producto" o importación CSV (stock>0, costoPromedio nunca tocado,
    // sigue en 0). Antes de este fix, la primera Compra promediaba su costo
    // real con esas unidades "gratis" y el resultado quedaba diluido muy
    // por debajo de lo que realmente costó — verificado contra un backup
    // real: "KARMA GUARANA" cayó de 95.58 a 57.35 por 4 unidades así.
    const { svc, manager } = makeService({ id: 1, costoPromedio: '0' });
    await svc.actualizarCostoPromedio(1, /* stockAntes */ 4, /* cantidadNueva */ 6, /* costoNuevo */ 95.58);
    const [, params] = llamada(manager, 1);
    expect(params).toEqual([95.58, 1]); // el costo real completo, no (4·0+6·95.58)/10=57.348
  });

  it('costoActual genuinamente 0 (no "0 con stockAntes>0 y costo real más adelante" mezclado dos veces)', async () => {
    // Dos Compras reales en secuencia, ambas sobre stock que llegó primero
    // sin costo conocido: la primera reemplaza limpio (ya cubierto arriba);
    // la SEGUNDA, con costoActual ya no-cero, promedia normalmente — el fix
    // no rompe el caso clásico una vez que el producto ya tiene un costo real.
    const { svc, manager } = makeService({ id: 1, costoPromedio: '95.58' });
    await svc.actualizarCostoPromedio(1, /* stockAntes */ 10, /* cantidadNueva */ 10, /* costoNuevo */ 50);
    const [, params] = llamada(manager, 1);
    // (10·95.58 + 10·50)/20 = 72.79
    expect(params).toEqual([72.79, 1]);
  });

  it('stockAntes negativo (no debería pasar, pero por seguridad) también reemplaza en vez de dividir por algo raro', async () => {
    const { svc, manager } = makeService({ id: 1, costoPromedio: '5' });
    await svc.actualizarCostoPromedio(1, -1, 10, 20);
    const [, params] = llamada(manager, 1);
    expect(params).toEqual([20, 1]);
  });

  it('producto no encontrado: no hace nada (no explota)', async () => {
    const { svc, manager } = makeService(null);
    await svc.actualizarCostoPromedio(999, 10, 5, 20);
    expect(manager.query).toHaveBeenCalledTimes(1); // solo el SELECT — nunca llega al UPDATE
  });

  it('redondea a 4 decimales', async () => {
    const { svc, manager } = makeService({ id: 1, costoPromedio: '3.3333' });
    // (7*3.3333 + 3*10) / 10 = 5.33331
    await svc.actualizarCostoPromedio(1, 7, 3, 10);
    const [, params] = llamada(manager, 1);
    expect(params).toEqual([5.3333, 1]);
  });

  // ── COMMIT 1 — protección 1: empresaId ──────────────────────────────────

  it('el SELECT ... FOR UPDATE va scopeado por empresaId, no solo por id', async () => {
    const { svc, manager } = makeService({ id: 1, costoPromedio: '5' }, 7);
    await svc.actualizarCostoPromedio(1, 10, 10, 15);
    const [sql, params] = llamada(manager, 0);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('"empresaId" = $2');
    expect(params).toEqual([1, 7]);
  });

  it('producto de otra empresa: el SELECT no encuentra fila (scopeado) y no se actualiza nada', async () => {
    // El mock simula lo que Postgres haría de verdad: WHERE id=$1 AND
    // empresaId=$2 con un producto de otra empresa no devuelve fila.
    const { svc, manager } = makeService(null, 42); // empresa 42 pide un producto que no es suyo
    await svc.actualizarCostoPromedio(1, 10, 10, 15);
    expect(manager.query).toHaveBeenCalledTimes(1); // solo el SELECT, nunca un UPDATE
    const [, paramsSelect] = llamada(manager, 0);
    expect(paramsSelect).toEqual([1, 42]);
  });
});

// ── COMMIT 1 — protección 2: concurrencia real con BD (requiere DB_HOST) ────
// Mismo patrón que encf-generator.service.spec.ts: se auto-skipea en CI (no
// configura DB_HOST para este job). Dos compras "simultáneas" del MISMO
// producto no deben perderse una a la otra — sin el SELECT ... FOR UPDATE,
// ambas leen el mismo costoPromedio viejo y la segunda en terminar pisa a la
// primera; con el lock, la segunda transacción espera y relee el valor YA
// actualizado por la primera antes de calcular el suyo.

import { DataSource } from 'typeorm';

const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('actualizarCostoPromedio() — concurrencia real contra Postgres', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('dos compras concurrentes del mismo producto: la segunda relee el resultado de la primera, ninguna se pierde', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let productoId!: number;
    try {
      const EMPRESA = 900201;
      const [{ id }] = await qr.query(
        `INSERT INTO productos (codigo, nombre, precio, "costoPromedio", stock, "unidadMedida", "empresaId")
         VALUES ('TEST-AVCO', 'Producto de prueba AVCO', 100, 10, 20, 'unidad', $1) RETURNING id`,
        [EMPRESA],
      );
      productoId = id;
      await qr.commitTransaction(); // el producto debe quedar COMMITEADO — cada compra abre su propia transacción real

      const svc: any = Object.create(ValoracionStockService.prototype);
      svc.dataSource = dataSource;
      svc.tenantSvc  = { getEmpresaId: () => EMPRESA };

      // Ambas compras "ven" el mismo stockAntes=20/costoActual=10 antes de
      // que ninguna corra — el escenario clásico de lost update. Sin el
      // SELECT ... FOR UPDATE, ambas leerían costoActual=10 en paralelo,
      // calcularían cada una su propio promedio de forma aislada, y la que
      // escriba SEGUNDA pisaría por completo el resultado de la primera —
      // el final sería exactamente 11.6667 o exactamente 14 (una de las
      // dos, la otra desaparecida sin dejar rastro). Con el lock, la
      // segunda transacción espera a que la primera confirme y relee su
      // costoPromedio YA actualizado antes de calcular el suyo — el
      // resultado final SIEMPRE compone ambas compras en secuencia.
      //   Compra1 primero: (20·10+10·15)/30=11.6667 → Compra2 después,
      //     partiendo de 11.6667: (20·11.6667+5·30)/25=15.3334
      //   Compra2 primero: (20·10+5·30)/25=14 → Compra1 después,
      //     partiendo de 14: (20·14+10·15)/30=14.3333
      await Promise.all([
        svc.actualizarCostoPromedio(productoId, 20, 10, 15),
        svc.actualizarCostoPromedio(productoId, 20, 5, 30),
      ]);

      const [prod] = await dataSource.query(`SELECT "costoPromedio" FROM productos WHERE id = $1`, [productoId]);
      const final = Number(prod.costoPromedio);

      // Debe ser UNO de los dos resultados secuenciales válidos — nunca el
      // valor "aislado" de una sola compra (11.6667 o 14 a secas), que es
      // la firma exacta de un lost update.
      expect([15.3334, 14.3333]).toContain(final);
    } finally {
      if (productoId) await dataSource.query(`DELETE FROM productos WHERE id = $1`, [productoId]);
      await qr.release();
    }
  }, 30_000);
});
