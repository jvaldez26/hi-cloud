import { DataSource } from 'typeorm';
import { CxCService } from './cxc.service';
import { ReportesService } from '../reportes/reportes.service';

/**
 * Integración REAL contra Postgres (no mocks). Bug reportado: una factura
 * cancelada deja de aparecer en el estado de cuenta del cliente
 * (clientes.service.ts filtra facturas.estado != 'cancelada'), pero su CxC
 * seguía sumando en la antigüedad de saldos — porque getAging() y
 * getAntiguedadCobrar() solo miraban cuentas_por_cobrar.estado, sin saber que
 * la factura detrás ya estaba cancelada.
 *
 * Esto pasa de verdad cuando anularPorFacturaId() (cxc.service.ts) deja la
 * CxC viva a propósito — factura cancelada con abonos aplicados o con e-CF
 * confirmado por DGII, donde no se revierte el asiento. Se reproduce aquí
 * insertando ese estado final directo (factura cancelada + CxC todavía con
 * montoPendiente > 0), sin pasar por el flujo completo de cancelación.
 *
 * Requiere la BD local de pruebas: 127.0.0.1:5433/hicloud_test. Se salta
 * automáticamente si no está disponible — nunca corre contra producción.
 */
const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_USERNAME = 'postgres';
const DB_PASSWORD = 'hicloud_dev_local';
const DB_NAME = 'hicloud_test';

const EMPRESA = 22;
const USUARIO_ID = 10; // ver compras-idempotencia.spec.ts — mismo fixture fijo

let ds: DataSource;
let dbDisponible = true;
let clienteId: number;
let facturaCanceladaBloqueadaId: number;
let facturaVivaId: number;

// facturas.folio es varchar(20) — con el prefijo "TAGN" y 8 dígitos del
// timestamp + 1 letra de sufijo sobran 7 caracteres de margen.
function folioUnico(sufijo: string): string {
  return `TAGN${Date.now().toString().slice(-8)}${sufijo}`;
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    host: DB_HOST, port: DB_PORT, username: DB_USERNAME, password: DB_PASSWORD, database: DB_NAME,
    entities: [], // getAging()/getAntiguedadCobrar() son SQL crudo — no hace falta metadata de entidades
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
    return;
  }

  const [cliente] = await ds.query(
    `INSERT INTO clientes ("empresaId", nombre) VALUES ($1, $2) RETURNING id`,
    [EMPRESA, 'TESTAGING Cliente Aislado'],
  );
  clienteId = cliente.id;

  // Factura A: cancelada, pero su CxC quedó "bloqueada" (abonos aplicados o
  // e-CF confirmado) — montoPendiente sigue > 0 a propósito.
  const [facA] = await ds.query(
    `INSERT INTO facturas ("empresaId", folio, fecha, estado, "usuarioId", "clienteId")
     VALUES ($1, $2, CURRENT_DATE, 'cancelada', $3, $4) RETURNING id`,
    [EMPRESA, folioUnico('C'), USUARIO_ID, clienteId],
  );
  facturaCanceladaBloqueadaId = facA.id;
  await ds.query(
    `INSERT INTO cuentas_por_cobrar
       ("empresaId", "facturaId", "clienteId", "montoOriginal", "montoPagado", "montoPendiente",
        "fechaEmision", "fechaVencimiento", estado, "userId")
     VALUES ($1, $2, $3, 500, 500, 500, CURRENT_DATE, CURRENT_DATE, 'pagada_parcial', $4)`,
    [EMPRESA, facturaCanceladaBloqueadaId, clienteId, USUARIO_ID],
  );

  // Factura B: viva (emitida), para confirmar que SÍ sigue contando — el fix
  // no debe excluir nada que no sea de una factura cancelada.
  const [facB] = await ds.query(
    `INSERT INTO facturas ("empresaId", folio, fecha, estado, "usuarioId", "clienteId")
     VALUES ($1, $2, CURRENT_DATE, 'emitida', $3, $4) RETURNING id`,
    [EMPRESA, folioUnico('V'), USUARIO_ID, clienteId],
  );
  facturaVivaId = facB.id;
  await ds.query(
    `INSERT INTO cuentas_por_cobrar
       ("empresaId", "facturaId", "clienteId", "montoOriginal", "montoPagado", "montoPendiente",
        "fechaEmision", "fechaVencimiento", estado, "userId")
     VALUES ($1, $2, $3, 300, 0, 300, CURRENT_DATE, CURRENT_DATE, 'pendiente', $4)`,
    [EMPRESA, facturaVivaId, clienteId, USUARIO_ID],
  );
});

afterAll(async () => {
  if (!dbDisponible) return;
  await ds.query(`DELETE FROM cuentas_por_cobrar WHERE "facturaId" IN ($1, $2)`, [facturaCanceladaBloqueadaId, facturaVivaId]);
  await ds.query(`DELETE FROM facturas WHERE id IN ($1, $2)`, [facturaCanceladaBloqueadaId, facturaVivaId]);
  await ds.query(`DELETE FROM clientes WHERE id = $1`, [clienteId]);
  await ds.destroy();
});

function buildCxCService(empresaId: number) {
  const tenantService = { getEmpresaId: () => empresaId };
  return new CxCService({} as any, {} as any, {} as any, {} as any, {} as any, ds, {} as any, tenantService as any);
}

function buildReportesService(empresaId: number) {
  const tenantService = { getEmpresaId: () => empresaId };
  return new ReportesService(ds, {} as any, tenantService as any, {} as any);
}

describe('Antigüedad de saldos (CxC) excluye facturas canceladas con CxC bloqueada', () => {
  it('CxCService.getAging(): el total del cliente solo incluye la factura viva, no la cancelada-bloqueada', async () => {
    if (!dbDisponible) return;
    const svc = buildCxCService(EMPRESA);
    const filas = await svc.getAging();

    const fila = filas.find((f: any) => f.cliente.nombre === 'TESTAGING Cliente Aislado');
    expect(fila).toBeDefined();
    expect(fila!.total).toBe(300); // solo la viva — los 500 de la cancelada-bloqueada NO suman
  });

  it('ReportesService.getAntiguedadCobrar(): el total de la empresa no sube con la factura cancelada-bloqueada', async () => {
    if (!dbDisponible) return;

    // Baseline SIN la factura cancelada-bloqueada (se borra temporalmente su
    // CxC) para medir el total real de la empresa antes de insertarla de
    // nuevo — evita depender de que la empresa 22 esté vacía de otros datos.
    await ds.query(`UPDATE cuentas_por_cobrar SET "isActive" = false WHERE "facturaId" = $1`, [facturaCanceladaBloqueadaId]);
    const svc = buildReportesService(EMPRESA);
    const antes = await svc.getAntiguedadCobrar();

    await ds.query(`UPDATE cuentas_por_cobrar SET "isActive" = true WHERE "facturaId" = $1`, [facturaCanceladaBloqueadaId]);
    const despues = await svc.getAntiguedadCobrar();

    expect(despues.total).toBe(antes.total); // la cancelada-bloqueada no debe sumar nada
  });

  it('ambos reportes SÍ cuentan una CxC viva de una factura NO cancelada (control negativo)', async () => {
    if (!dbDisponible) return;

    await ds.query(`UPDATE cuentas_por_cobrar SET "isActive" = false WHERE "facturaId" = $1`, [facturaVivaId]);
    const svc = buildReportesService(EMPRESA);
    const antes = await svc.getAntiguedadCobrar();

    await ds.query(`UPDATE cuentas_por_cobrar SET "isActive" = true WHERE "facturaId" = $1`, [facturaVivaId]);
    const despues = await svc.getAntiguedadCobrar();

    expect(Number(despues.total) - Number(antes.total)).toBe(300);
  });
});
