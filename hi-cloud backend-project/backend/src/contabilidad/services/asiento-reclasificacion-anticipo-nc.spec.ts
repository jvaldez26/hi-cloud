import { DataSource } from 'typeorm';
import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { AsientoContable, TipoOrigenAsiento } from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { User } from '../../users/users.entity';

/**
 * Integración REAL contra Postgres — prueba contable pedida tras el fix del
 * saldo a favor por NC código 1: factura a crédito 100 (subtotal 84.75,
 * ITBIS 15.25), abono 40, NC código 1 aceptada.
 *
 * Reproduce la cadena completa de 4 asientos (factura emitida → abono →
 * NC → reclasificación a anticipo) contra cuentas_contables reales de la
 * empresa 22 (mismo fixture fijo que el resto de specs de esta sesión) y
 * verifica, leyendo asiento_lineas de verdad:
 *   - saldo neto de Clientes (suma debe-haber de los 4 asientos) = 0
 *   - la cuenta de contrapartida del abono (Bancos, la que
 *     asientoCobro() usa por defecto cuando no se pasa cuentaContrapartida
 *     — "Caja" en sentido amplio) NO vuelve a aparecer en la NC ni en la
 *     reclasificación: su saldo tras esos dos pasos es exactamente el
 *     mismo que dejó el abono, sin cambio
 *   - Anticipos de Clientes queda con el saldo a favor real (40)
 *
 * anticipoId/ncId/facturaId/pagoId son sintéticos (AsientoContable.referenciaId
 * no tiene FK) — solo necesitan ser únicos para poder filtrar las líneas de
 * cada paso sin interferencia de otros datos.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

const EMPRESA = 22;
const USUARIO_ID = 10;

let ds: DataSource;
let dbDisponible = true;
let asientoIds: number[] = [];

function buildService(ds: DataSource, empresaId: number) {
  const tenantService = { getEmpresaId: () => empresaId };
  const configuracionService = { obtenerMapa: jest.fn().mockResolvedValue({}) }; // sin overrides — usa los códigos por defecto (COD)
  return new AsientosAutomaticosService(
    ds.getRepository(CuentaContable) as any,
    ds.getRepository(AsientoContable) as any,
    ds.getRepository(AsientoLinea) as any,
    tenantService as any,
    ds,
    configuracionService as any,
  );
}

/** Suma neta (debe - haber) de un código de cuenta, para un conjunto de (tipoOrigen, referenciaId). */
async function saldoNeto(codigo: string, grupos: { tipoOrigen: string; referenciaId: number }[]): Promise<number> {
  if (grupos.length === 0) return 0;
  const condiciones = grupos.map((_, i) => `(ac."tipoOrigen" = $${i * 2 + 2} AND ac."referenciaId" = $${i * 2 + 3})`).join(' OR ');
  const params: any[] = [codigo];
  for (const g of grupos) params.push(g.tipoOrigen, g.referenciaId);
  const [row] = await ds.query<{ neto: string }[]>(
    `SELECT COALESCE(SUM(al.debe - al.haber), 0)::numeric AS neto
     FROM asiento_lineas al
     JOIN asientos_contables ac ON ac.id = al."asientoId"
     JOIN cuentas_contables cc ON cc.id = al."cuentaContableId"
     WHERE cc.codigo = $1 AND (${condiciones})`,
    params,
  );
  return Number(row.neto);
}

async function cuantasLineas(codigo: string, tipoOrigen: string, referenciaId: number): Promise<number> {
  const [row] = await ds.query<{ n: string }[]>(
    `SELECT COUNT(*)::int AS n
     FROM asiento_lineas al
     JOIN asientos_contables ac ON ac.id = al."asientoId"
     JOIN cuentas_contables cc ON cc.id = al."cuentaContableId"
     WHERE cc.codigo = $1 AND ac."tipoOrigen" = $2 AND ac."referenciaId" = $3`,
    [codigo, tipoOrigen, referenciaId],
  );
  return Number(row.n);
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    // User: AsientoContable tiene @ManyToOne(() => User) — sin incluirla,
    // TypeORM falla al construir la metadata (mismo pitfall que
    // compras-idempotencia.spec.ts con Producto, ver esa misma sesión).
    entities: [CuentaContable, AsientoContable, AsientoLinea, User],
    synchronize: false,
    connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    // DB_HOST configurado pero initialize() falló: es un bug real (credenciales,
    // metadata de entidades, etc.), no "no disponible" — nunca debe pasar en
    // verde. Solo se salta de verdad cuando NO hay DB_HOST (CI sin Postgres).
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
    // eslint-disable-next-line no-console
    console.error('[asiento-reclasificacion-anticipo-nc.spec] DB no disponible:', (err as Error).message);
  }
});

afterAll(async () => {
  if (!dbDisponible) return;
  if (asientoIds.length) {
    await ds.query(`DELETE FROM asiento_lineas WHERE "asientoId" = ANY($1)`, [asientoIds]);
    await ds.query(`DELETE FROM asientos_contables WHERE id = ANY($1)`, [asientoIds]);
  }
  await ds.destroy();
});

describe('Cadena contable real: factura a crédito 100 + abono 40 + NC código 1 + reclasificación a anticipo', () => {
  it('Clientes neto = 0, la cuenta del abono queda sin cambio tras la NC, Anticipos = 40', async () => {
    if (!dbDisponible) return;
    const svc = buildService(ds, EMPRESA);
    const hoy = new Date().toISOString().slice(0, 10);

    // Ids sintéticos únicos — AsientoContable.referenciaId no tiene FK, pero
    // SÍ es integer de 32 bits: Date.now() (13 dígitos) lo desborda y cada
    // asiento fallaba en silencio (try/catch interno de cada método). Unix
    // segundos (~10 dígitos, bajo 2^31-1 hasta 2038) cabe con margen.
    const base = Math.floor(Date.now() / 1000);
    const facturaId = base + 1;
    const pagoId     = base + 2;
    const ncId       = base + 3;
    const anticipoId = base + 4;
    const folio       = `TESTCONT-${base}`;

    // 1) Factura a crédito: Debe Clientes 100 / Haber Ventas 84.75 + ITBIS 15.25
    await svc.asientoFacturaEmitida(
      facturaId, 100, 84.75, 15.25, folio, hoy, USUARIO_ID,
      undefined, { tipoPago: 'CREDITO' },
    );

    // 2) Abono de 40: Debe [contrapartida, Bancos por defecto] / Haber Clientes 40
    await svc.asientoCobro(40, pagoId, facturaId, hoy, USUARIO_ID);

    // 3) NC código 1 (anulación total, total=100): Debe Ventas 84.75 + Debe ITBIS 15.25 / Haber Clientes 100
    await svc.asientoNotaCredito(ncId, 100, 84.75, 15.25, folio, hoy, USUARIO_ID);

    // 4) Reclasificación del abono atrapado: Debe Clientes 40 / Haber Anticipos 40
    await svc.asientoReclasificacionAnticipoNc(40, anticipoId, folio, hoy, USUARIO_ID);

    // Recolectar los asientos creados para limpieza
    const creados = await ds.query<{ id: number }[]>(
      `SELECT id FROM asientos_contables WHERE "referenciaFolio" = $1 OR ("tipoOrigen" = 'cobro' AND "referenciaId" IN ($2, $3))`,
      [folio, pagoId, anticipoId],
    );
    asientoIds = creados.map(r => r.id);
    expect(asientoIds.length).toBe(4); // factura, abono, NC, reclasificación

    const grupos = [
      { tipoOrigen: TipoOrigenAsiento.FACTURA,      referenciaId: facturaId },
      { tipoOrigen: TipoOrigenAsiento.COBRO,        referenciaId: pagoId },
      { tipoOrigen: TipoOrigenAsiento.NOTA_CREDITO, referenciaId: ncId },
      { tipoOrigen: TipoOrigenAsiento.COBRO,        referenciaId: anticipoId },
    ];

    // ── Clientes: 0 neto — la factura, el abono, la NC y la reclasificación se cancelan exactamente ──
    const netoClientes = await saldoNeto('1.1.2.01', grupos);
    expect(netoClientes).toBe(0);

    // ── La cuenta que recibió el abono (Bancos, "Caja" en sentido amplio — es
    // la contrapartida por defecto de asientoCobro sin cuentaContrapartida
    // explícita) solo aparece en el paso 2; ni la NC ni la reclasificación
    // la tocan — su saldo después de la NC es el MISMO que dejó el abono.
    const lineasBancosEnNcYReclasif =
      (await cuantasLineas('1.1.1.03', TipoOrigenAsiento.NOTA_CREDITO, ncId)) +
      (await cuantasLineas('1.1.1.03', TipoOrigenAsiento.COBRO, anticipoId));
    expect(lineasBancosEnNcYReclasif).toBe(0);

    const netoBancosSoloAbono = await saldoNeto('1.1.1.03', [{ tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: pagoId }]);
    expect(netoBancosSoloAbono).toBe(40); // Debe 40 — sin cambio, es el único movimiento que lo toca

    // ── Anticipos de Clientes: saldo a favor real, 40 ──
    const netoAnticipos = await saldoNeto('2.1.5.01', [{ tipoOrigen: TipoOrigenAsiento.COBRO, referenciaId: anticipoId }]);
    expect(netoAnticipos).toBe(-40); // Haber 40 (pasivo, saldo acreedor)
  });
});
