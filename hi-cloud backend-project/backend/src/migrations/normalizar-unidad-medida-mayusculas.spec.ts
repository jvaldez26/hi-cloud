import { DataSource } from 'typeorm';

/**
 * Integración REAL contra Postgres — misma lógica SQL que
 * 1788000000000-NormalizarUnidadMedidaPorMayusculas.ts (el UPDATE de la
 * migración es un WITH ... UPDATE; aquí se prueba el WITH como SELECT
 * contra fixtures y, en el último test, el UPDATE real sobre una tabla
 * `productos` de prueba). Cubre: normalización directa (pza→PZA), no
 * tocar lo que ya está exacto, no tocar lo que no calza con nada, y NO
 * normalizar cuando hay más de una unidad candidata (ambigüedad).
 *
 * Requiere la BD local de pruebas: 127.0.0.1:5433/hicloud_test. Se salta
 * automáticamente si no está disponible — nunca corre contra producción.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

let ds: DataSource;
let dbDisponible = true;

const EMPRESA = 777_040;

const SQL_NORMALIZAR = `
  WITH candidatos AS (
    SELECT p.id AS "productoId", p."unidadMedida" AS actual, u.codigo AS correcta
    FROM productos p
    JOIN unidades_medida u
      ON u."empresaId" = p."empresaId"
     AND u.activa = true
     AND LOWER(u.codigo) = LOWER(p."unidadMedida")
    WHERE p."isActive" = true AND p."empresaId" = $1
      AND NOT EXISTS (
        SELECT 1 FROM unidades_medida u2
        WHERE u2."empresaId" = p."empresaId" AND u2.codigo = p."unidadMedida" AND u2.activa = true
      )
  ),
  sinAmbiguedad AS (
    SELECT "productoId", MIN(correcta) AS correcta
    FROM candidatos
    GROUP BY "productoId"
    HAVING COUNT(DISTINCT correcta) = 1
  )
  UPDATE productos p
  SET "unidadMedida" = s.correcta
  FROM sinAmbiguedad s
  WHERE p.id = s."productoId"
  RETURNING p.id, p."unidadMedida"
`;

async function limpiar() {
  await ds.query(`DELETE FROM productos WHERE "empresaId" = $1`, [EMPRESA]);
  await ds.query(`DELETE FROM unidades_medida WHERE "empresaId" = $1`, [EMPRESA]);
}

async function crearProducto(nombre: string, unidadMedida: string) {
  const [row] = await ds.query(
    `INSERT INTO productos (nombre, precio, "unidadMedida", "empresaId", tipo, "isActive")
     VALUES ($1, 100, $2, $3, 'producto', true) RETURNING id, "unidadMedida"`,
    [nombre, unidadMedida, EMPRESA],
  );
  return row;
}

async function crearUnidad(codigo: string) {
  await ds.query(
    `INSERT INTO unidades_medida (codigo, nombre, "empresaId", activa) VALUES ($1, $1, $2, true)`,
    [codigo, EMPRESA],
  );
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
  }
});

afterAll(async () => {
  if (!dbDisponible) return;
  await limpiar();
  await ds.destroy();
});

describe('Migración NormalizarUnidadMedidaPorMayusculas (integración real contra Postgres)', () => {
  it('normaliza "pza" a "PZA" cuando el catálogo tiene exactamente esa unidad', async () => {
    if (!dbDisponible) return;
    await limpiar();
    await crearUnidad('PZA');
    const prod = await crearProducto('Producto A', 'pza');

    const [resultado] = await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    expect(resultado).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: prod.id, unidadMedida: 'PZA' }),
    ]));

    const [verificado] = await ds.query(`SELECT "unidadMedida" FROM productos WHERE id = $1`, [prod.id]);
    expect(verificado.unidadMedida).toBe('PZA');
  });

  it('no toca un producto cuya unidad YA calza exacto con el catálogo', async () => {
    if (!dbDisponible) return;
    await limpiar();
    await crearUnidad('KG');
    const prod = await crearProducto('Producto B', 'KG');

    const [resultado] = await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    expect(resultado.find((r: any) => r.id === prod.id)).toBeUndefined();

    const [verificado] = await ds.query(`SELECT "unidadMedida" FROM productos WHERE id = $1`, [prod.id]);
    expect(verificado.unidadMedida).toBe('KG');
  });

  it('no toca un producto cuya unidad no calza con NADA del catálogo ni ignorando mayúsculas', async () => {
    if (!dbDisponible) return;
    await limpiar();
    await crearUnidad('PZA');
    const prod = await crearProducto('Producto C', 'GALON_RARO');

    const [resultado] = await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    expect(resultado.find((r: any) => r.id === prod.id)).toBeUndefined();

    const [verificado] = await ds.query(`SELECT "unidadMedida" FROM productos WHERE id = $1`, [prod.id]);
    expect(verificado.unidadMedida).toBe('GALON_RARO');
  });

  it('AMBIGÜEDAD: si dos unidades del catálogo calzan ignorando mayúsculas, no adivina — no toca el producto', async () => {
    if (!dbDisponible) return;
    await limpiar();
    // Caso artificial: dos filas de catálogo que solo difieren en mayúsculas
    // (no debería pasar en la práctica, pero la migración se defiende igual).
    await crearUnidad('Pza');
    await crearUnidad('PZA');
    const prod = await crearProducto('Producto D', 'pza');

    const [resultado] = await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    expect(resultado.find((r: any) => r.id === prod.id)).toBeUndefined();

    const [verificado] = await ds.query(`SELECT "unidadMedida" FROM productos WHERE id = $1`, [prod.id]);
    expect(verificado.unidadMedida).toBe('pza'); // intacto
  });

  it('es idempotente: correrla dos veces no cambia nada la segunda vez', async () => {
    if (!dbDisponible) return;
    await limpiar();
    await crearUnidad('LT');
    const prod = await crearProducto('Producto E', 'lt');

    await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    const [segundaCorrida] = await ds.query(SQL_NORMALIZAR, [EMPRESA]);
    expect(segundaCorrida.find((r: any) => r.id === prod.id)).toBeUndefined();

    const [verificado] = await ds.query(`SELECT "unidadMedida" FROM productos WHERE id = $1`, [prod.id]);
    expect(verificado.unidadMedida).toBe('LT');
  });
});
