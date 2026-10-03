/**
 * Regresión del deadlock por agotamiento del pool en registrarRetiro()
 * (mismo patrón que encf-generator.service.ts — ver commit "deadlock por
 * agotamiento del pool en ENCFGeneratorService"): dentro de la transacción
 * que bloquea la caja con SELECT...FOR UPDATE, getEmpresaCfg() pedía una
 * SEGUNDA conexión del pool con this.dataSource.query en vez de usar el
 * manager de la transacción. Con concurrencia ≥ pool.max, la transacción que
 * ya tiene el lock queda esperando una conexión que nunca llega porque el
 * resto de las transacciones concurrentes la están agotando esperando ese
 * mismo lock — deadlock total.
 *
 * Solo corre si DB_HOST está configurado (igual que
 * encf-generator.service.spec.ts); se salta en CI sin DB_HOST.
 */
import { DataSource } from 'typeorm';
import { CajaService } from './caja.service';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { RetiroCaja, CategoriaRetiro } from './entities/retiro-caja.entity';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_TEST = 9998;

(TIENE_BD ? describe : describe.skip)('CajaService.registrarRetiro — concurrencia con BD real', () => {
  let dataSource: DataSource;
  let service: CajaService;
  let cajaId: number;

  beforeAll(async () => {
    // Pool deliberadamente pequeño para reproducir el agotamiento con pocas
    // llamadas concurrentes en vez de necesitar cientos.
    dataSource = new DataSource({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CierreCaja, RetiroCaja],
      extra:    { max: 5 },
    });
    await dataSource.initialize();

    await dataSource.query('DELETE FROM retiros_caja WHERE "empresaId" = $1', [EMPRESA_TEST]);
    await dataSource.query('DELETE FROM cierres_caja WHERE "empresaId" = $1', [EMPRESA_TEST]);

    const [{ id }] = await dataSource.query(
      `INSERT INTO cierres_caja
         (fecha, "empresaId", "userId", estado, "saldoApertura", "formulaVersion")
       VALUES (CURRENT_DATE, $1, 1, 'abierta', 1000000, 2)
       RETURNING id`,
      [EMPRESA_TEST],
    );
    cajaId = id;

    const tenantServiceStub = { getEmpresaId: () => EMPRESA_TEST } as any;
    const realtimeServiceStub = { notify: jest.fn() } as any;

    service = new CajaService(
      dataSource.getRepository(CierreCaja),
      dataSource.getRepository(RetiroCaja),
      dataSource,
      tenantServiceStub,
      realtimeServiceStub,
    );
  });

  afterAll(async () => {
    await dataSource?.query('DELETE FROM retiros_caja WHERE "empresaId" = $1', [EMPRESA_TEST]);
    await dataSource?.query('DELETE FROM cierres_caja WHERE "empresaId" = $1', [EMPRESA_TEST]);
    await dataSource?.destroy();
  });

  it('20 retiros concurrentes (> pool.max=5) sobre la MISMA caja terminan todos, sin colgarse', async () => {
    const promesas = Array.from({ length: 20 }, (_, i) =>
      service.registrarRetiro(cajaId, 10, `Retiro de prueba #${i}`, 1, 'Test'),
    );
    const resultados = await Promise.all(promesas);

    expect(resultados).toHaveLength(20);

    const numeros = resultados.map(r => r.numero);
    expect(new Set(numeros).size).toBe(20); // todos los RET- son únicos

    const [{ total, cantidad }] = await dataSource.query(
      `SELECT COALESCE(SUM(monto), 0)::text AS total, COUNT(*)::text AS cantidad
         FROM retiros_caja WHERE "cajaDiariaId" = $1 AND estado != 'anulado'`,
      [cajaId],
    );
    expect(Number(cantidad)).toBe(20);
    expect(Number(total)).toBe(200); // 20 × RD$10

    const [caja] = await dataSource.query(
      `SELECT retiros FROM cierres_caja WHERE id = $1`, [cajaId],
    );
    expect(Number(caja.retiros)).toBe(200); // actualizarTotalRetiros recalculó bien
  }, 30_000);
});
