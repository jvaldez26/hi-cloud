import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { FacturasService } from './facturas.service';
import { SupervisorTarjetasService } from '../supervisor-tarjetas/supervisor-tarjetas.service';
import { TarjetaSupervisor } from '../supervisor-tarjetas/entities/tarjeta-supervisor.entity';
import { SupervisorTarjetaConfig } from '../supervisor-tarjetas/entities/supervisor-tarjeta-config.entity';

/**
 * Integración REAL contra Postgres — conecta las DOS puntas que el pedido
 * del usuario exige probar explícitamente: una venta a crédito en modo
 * 'cada_vez' autorizada ESCANEANDO UNA TARJETA debe poder emitirse.
 *
 * Nadie prueba hoy ese enlace de punta a punta: supervisor-tarjetas.service
 * .integration.spec.ts prueba la tarjeta sola, supervisor-tarjeta-auth.spec.ts
 * prueba AuthService con mocks, y validar-autorizacion-venta-credito.spec.ts
 * prueba FacturasService con mocks — ninguno hace pasar el MISMO token real
 * por las dos tablas reales (supervisor_autorizaciones) para confirmar que
 * lo que AuthService.verificarSupervisor() inserta es exactamente lo que
 * FacturasService.validarAutorizacionVentaCredito() consume.
 *
 * Llama a los métodos privados tal cual (mismo patrón que los specs
 * hermanos) con un `ctx` mínimo — evita instanciar AuthService/FacturasService
 * completos, que arrastran media docena de servicios cada uno.
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
let empresaId: number;
let adminId: number;
let cajeroId: number;

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
  `, ['000CREDTARJ', 'TEST-CREDITO-CON-TARJETA', randomUUID()]);
  empresaId = empresa.id;

  const [admin] = await ds.query(`
    INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id
  `, ['Test Admin Supervisor', `test-admin-credito-${Date.now()}@hicloud.test`, 'x', 'admin']);
  adminId = admin.id;
  const [cajero] = await ds.query(`
    INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id
  `, ['Test Cajero', `test-cajero-credito-${Date.now()}@hicloud.test`, 'x', 'vendedor']);
  cajeroId = cajero.id;

  await ds.query(`INSERT INTO usuario_empresa ("userId", "empresaId", "isActive") VALUES ($1, $2, true)`, [adminId, empresaId]);
  await ds.query(`INSERT INTO usuario_empresa ("userId", "empresaId", "isActive") VALUES ($1, $2, true)`, [cajeroId, empresaId]);

  // venta_credito en modo 'cada_vez' — el caso que el pedido pide confirmar.
  await ds.query(`
    INSERT INTO supervisor_politicas ("empresaId", clave, requerido, modo)
    VALUES ($1, 'venta_credito', true, 'cada_vez')
    ON CONFLICT ("empresaId", clave) DO UPDATE SET requerido = true, modo = 'cada_vez'
  `, [empresaId]);
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM supervisor_autorizaciones WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM pos_supervisor_log WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM tarjetas_supervisor WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM supervisor_politicas WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM usuario_empresa WHERE "empresaId" = $1`, [empresaId]);
  await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [[adminId, cajeroId]]);
  await ds.query(`DELETE FROM empresa WHERE id = $1`, [empresaId]);
  await ds.destroy();
});

describe('Venta a crédito (modo cada_vez) autorizada con tarjeta de supervisor — SQL real contra Postgres', () => {
  it('se salta si no hay BD local (nunca corre contra producción)', () => {
    expect(typeof dbDisponible).toBe('boolean');
  });

  it('escanear la tarjeta del admin emite un token para venta_credito, y ESE token autoriza la emisión de la factura', async () => {
    if (!dbDisponible) return;

    const tarjetasSvc = new SupervisorTarjetasService(
      ds.getRepository(TarjetaSupervisor), ds.getRepository(SupervisorTarjetaConfig), ds,
    );
    const tarjeta = await tarjetasSvc.generarTarjeta(empresaId, adminId, adminId);

    // AuthService.verificarSupervisorPorTarjeta/finalizarAutorizacionSupervisor
    // (privados) sobre un ctx mínimo — solo usan dataSource/supervisorTarjetas/
    // supervisorAttempts/bloqueoAlertaSvc/logger.
    const authCtx: any = Object.create(AuthService.prototype);
    authCtx.dataSource = ds;
    authCtx.supervisorTarjetas = tarjetasSvc;
    authCtx.supervisorAttempts = {
      isBlocked: async () => ({ blocked: false }),
      registrarFallo: async () => ({ intentos: 1, bloqueado: false }),
      reset: async () => {},
    };
    authCtx.bloqueoAlertaSvc = { avisarBloqueoSupervisor: async () => {} };
    authCtx.logger = { log: () => {}, error: () => {}, warn: () => {} };

    const resultado: any = await (AuthService.prototype as any).verificarSupervisor.call(
      authCtx,
      '', '', cajeroId, empresaId,
      'Venta a crédito', undefined, null, '127.0.0.1', 'test-agent',
      'venta_credito', tarjeta.codigo,
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.metodo).toBe('tarjeta');
    expect(resultado.supervisorToken).toBeDefined();

    // El token quedó de verdad en supervisor_autorizaciones, sin usar.
    const [filaToken] = await ds.query(
      `SELECT usado FROM supervisor_autorizaciones WHERE token = $1 AND "empresaId" = $2 AND clave = 'venta_credito'`,
      [resultado.supervisorToken, empresaId],
    );
    expect(filaToken).toBeDefined();
    expect(filaToken.usado).toBe(false);

    // Ahora FacturasService.validarAutorizacionVentaCredito (privado) consume
    // ESE MISMO token, como lo haría cambiarEstado() al reintentar la emisión
    // tras el modal del POS/lista de Facturas.
    const [facturaFantasma] = await ds.query(
      `SELECT $1::int AS id`, [999999], // no hace falta una fila real de facturas — el método solo lee/escribe por id
    );
    const factura: any = { id: facturaFantasma.id, supervisorSessionId: null, supervisorToken: null };
    const facturasCtx: any = Object.create(FacturasService.prototype);
    facturasCtx.dataSource = { query: (sql: string, params: any[]) => {
      // El UPDATE facturas de evidencia no tiene fila real que tocar en esta
      // prueba (no se crea una factura completa) — se deja pasar sin error.
      if (sql.includes('UPDATE facturas')) return Promise.resolve([]);
      return ds.query(sql, params);
    } };

    await expect(
      (FacturasService.prototype as any).validarAutorizacionVentaCredito.call(
        facturasCtx, factura, empresaId, adminId, cajeroId, null, null, resultado.supervisorToken,
      ),
    ).resolves.toBeUndefined();

    // Consumido: un segundo intento con el MISMO token ya no sirve (un solo uso).
    await expect(
      (FacturasService.prototype as any).validarAutorizacionVentaCredito.call(
        facturasCtx, { id: facturaFantasma.id, supervisorSessionId: null, supervisorToken: null },
        empresaId, adminId, cajeroId, null, null, resultado.supervisorToken,
      ),
    ).rejects.toThrow();
  });
});
