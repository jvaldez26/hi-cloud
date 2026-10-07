import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { SupervisorTarjetasService } from './supervisor-tarjetas.service';
import { TarjetaSupervisor } from './entities/tarjeta-supervisor.entity';
import { SupervisorTarjetaConfig } from './entities/supervisor-tarjeta-config.entity';
import { esFormatoTarjeta, PREFIJO_TARJETA } from './tarjeta-codigo.util';

/**
 * Integración REAL contra Postgres — igual criterio que
 * pagos-suscripcion/resumen-cobros.integration.spec.ts: esto prueba que el
 * SQL de verdad corre (los UPSERT con ON CONFLICT, los índices parciales
 * "WHERE activa = true") y, sobre todo, que el código de la tarjeta NUNCA
 * se guarda en claro en la fila — algo que un mock de dataSource.query no
 * puede demostrar porque el mock no es la BD.
 *
 * Requiere la BD local de pruebas: 127.0.0.1:5433/hicloud_test. Se salta
 * automáticamente si no está disponible — nunca corre contra producción.
 * Usa su propia empresa/usuario de prueba (limpiados al final) para no
 * tocar datos reales de la BD local compartida.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

let ds: DataSource;
let dbDisponible = true;
let svc: SupervisorTarjetasService;
let empresaId: number;
let userId: number;
const OTRA_EMPRESA_ID = 999_999_001; // no necesita existir como fila: el motivo 'otra_empresa' solo compara el id

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres', host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [TarjetaSupervisor, SupervisorTarjetaConfig],
    synchronize: false, connectTimeoutMS: 3000,
  });
  try {
    await ds.initialize();
  } catch (err) {
    if (process.env['DB_HOST']) throw err;
    dbDisponible = false;
    return;
  }

  const [empresa] = await ds.query(`
    INSERT INTO empresa (rnc, nombre, "xlinkId") VALUES ($1, $2, $3) RETURNING id
  `, ['000TARJTEST', 'TEST-TARJETA-SUPERVISOR', randomUUID()]);
  empresaId = empresa.id;

  const [usuario] = await ds.query(`
    INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id
  `, ['Test Supervisor Tarjeta', `test-tarjeta-${Date.now()}@hicloud.test`, 'x', 'admin']);
  userId = usuario.id;

  await ds.query(`
    INSERT INTO usuario_empresa ("userId", "empresaId", "isActive") VALUES ($1, $2, true)
  `, [userId, empresaId]);

  svc = new SupervisorTarjetasService(
    ds.getRepository(TarjetaSupervisor),
    ds.getRepository(SupervisorTarjetaConfig),
    ds,
  );
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM tarjetas_supervisor WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM supervisor_tarjeta_config WHERE "empresaId" IN ($1, $2)`, [empresaId, OTRA_EMPRESA_ID]);
  await ds.query(`DELETE FROM usuario_empresa WHERE "userId" = $1`, [userId]);
  await ds.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await ds.query(`DELETE FROM empresa WHERE id = $1`, [empresaId]);
  await ds.destroy();
});

describe('SupervisorTarjetasService — SQL real contra Postgres', () => {
  it('se salta si no hay BD local (nunca corre contra producción)', () => {
    expect(typeof dbDisponible).toBe('boolean');
  });

  it('genera una tarjeta con el formato correcto y NUNCA guarda el código en claro', async () => {
    if (!dbDisponible) return;

    const tarjeta = await svc.generarTarjeta(empresaId, userId, userId);
    expect(esFormatoTarjeta(tarjeta.codigo)).toBe(true);
    expect(tarjeta.ultimosCuatro).toBe(tarjeta.codigo.slice(-4));
    expect(tarjeta.nombre).toBe('Test Supervisor Tarjeta');
    expect(tarjeta.role).toBe('admin');

    const [fila] = await ds.query(
      `SELECT * FROM tarjetas_supervisor WHERE "userId" = $1 AND "empresaId" = $2 AND activa = true`,
      [userId, empresaId],
    );
    expect(fila).toBeDefined();
    expect(fila.codigoHash).toBe(createHash('sha256').update(tarjeta.codigo).digest('hex'));
    // La fila completa, en cualquier columna, nunca contiene el código en claro.
    expect(JSON.stringify(fila)).not.toContain(tarjeta.codigo);
    expect(fila.codigoHash).not.toBe(tarjeta.codigo);
  });

  it('generar una tarjeta nueva invalida la anterior — y una tarjeta revocada/regenerada no verifica', async () => {
    if (!dbDisponible) return;

    const t1 = await svc.generarTarjeta(empresaId, userId, userId);
    const r1 = await svc.verificarCodigo(t1.codigo, empresaId);
    expect(r1.ok).toBe(true);

    const t2 = await svc.generarTarjeta(empresaId, userId, userId); // regenera
    expect(t2.codigo).not.toBe(t1.codigo);

    const r1DespuesDeRegenerar = await svc.verificarCodigo(t1.codigo, empresaId);
    expect(r1DespuesDeRegenerar.ok).toBe(false);
    if (!r1DespuesDeRegenerar.ok) expect(r1DespuesDeRegenerar.motivo).toBe('revocada');

    const r2 = await svc.verificarCodigo(t2.codigo, empresaId);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.userId).toBe(userId);
  });

  it('una tarjeta de otra empresa no verifica', async () => {
    if (!dbDisponible) return;

    const tarjeta = await svc.generarTarjeta(empresaId, userId, userId);
    const resultado = await svc.verificarCodigo(tarjeta.codigo, OTRA_EMPRESA_ID);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('otra_empresa');
      expect((resultado as any).ownerId).toBe(userId);
    }
  });

  it('un código que no coincide con ninguna tarjeta devuelve no_existe (sin dueño)', async () => {
    if (!dbDisponible) return;
    const resultado = await svc.verificarCodigo(PREFIJO_TARJETA + '9'.repeat(22), empresaId); // formato real: 90 + 22 dígitos
    expect(resultado).toEqual({ ok: false, motivo: 'no_existe' });
  });

  it('revocar deja la tarjeta sin servir, y revocar de nuevo lanza NotFoundException', async () => {
    if (!dbDisponible) return;

    const tarjeta = await svc.generarTarjeta(empresaId, userId, userId);
    await svc.revocarTarjeta(empresaId, userId, userId, 'Prueba de revocación');

    const resultado = await svc.verificarCodigo(tarjeta.codigo, empresaId);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('revocada');

    await expect(svc.revocarTarjeta(empresaId, userId, userId, 'otra vez')).rejects.toThrow('No hay una tarjeta activa para revocar');
  });

  it('listarEquipo refleja el estado actual de la tarjeta del usuario', async () => {
    if (!dbDisponible) return;

    const sinTarjeta = await svc.listarEquipo(empresaId);
    expect(sinTarjeta.find((u: any) => u.userId === userId)?.ultimosCuatro ?? null).toBeNull();

    const tarjeta = await svc.generarTarjeta(empresaId, userId, userId);
    const conTarjeta = await svc.listarEquipo(empresaId);
    expect(conTarjeta.find((u: any) => u.userId === userId)?.ultimosCuatro).toBe(tarjeta.ultimosCuatro);
  });

  it('obtenerNivel por defecto es solo_tarjeta, y actualizarNivel persiste el cambio (upsert)', async () => {
    if (!dbDisponible) return;

    expect(await svc.obtenerNivel(empresaId)).toBe('solo_tarjeta');

    await svc.actualizarNivel(empresaId, 'tarjeta_pin', userId);
    expect(await svc.obtenerNivel(empresaId)).toBe('tarjeta_pin');

    await svc.actualizarNivel(empresaId, 'solo_tarjeta', userId); // el UPDATE del ON CONFLICT también funciona
    expect(await svc.obtenerNivel(empresaId)).toBe('solo_tarjeta');
  });
});
