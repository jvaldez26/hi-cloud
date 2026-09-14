import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BecasService } from './becas.service';
import { ColegiaturaService } from '../colegiatura/colegiatura.service';

/**
 * Contrato estático: becasAplicables() debe filtrar por empresa/estudiante/
 * isActive/año/aplicaA, y colegiatura.service.ts debe combinar plan.descuento
 * + becas SIEMPRE sobre montoBase (nunca en cascada), topado a montoBase y
 * nunca negativo, dejando traza en "concepto" (ver becas.service.ts y el
 * comentario de calcularDescuento() en colegiatura.service.ts).
 */
describe('SQL crudo de becas.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('becas.service.ts');

  it('becasAplicables() filtra por empresa, estudiante, isActive (ambas tablas) y aplicaA/ambos', () => {
    const s = src();
    const b = s.slice(s.indexOf('async becasAplicables('));
    expect(b).toContain('eb."empresaId" = $1');
    expect(b).toContain('eb."estudianteId" = $2');
    expect(b).toContain('eb."isActive" = true AND b."isActive" = true');
    expect(b).toContain('(b."aplicaA" = $4 OR b."aplicaA" = \'ambos\')');
  });
});

describe('SQL crudo de colegiatura.service.ts — combinación plan.descuento + becas', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('../colegiatura/colegiatura.service.ts');

  it('calcularDescuento() calcula plan y cada beca sobre montoBase, nunca en cascada', () => {
    const s = src();
    const b = s.slice(s.indexOf('private calcularDescuento('), s.indexOf('// ── Generación de cargos'));
    expect(b).toContain('montoBase * (Number(descuentoPlanPct ?? 0) / 100)');
    expect(b).toContain('montoBase * (Number(b.valor) / 100)');
    // Ninguno de los dos cálculos debe depender de "montoTotal" ni de un
    // monto "restante" — ambos parten siempre de montoBase.
    expect(b).not.toContain('montoRestante');
  });

  it('calcularDescuento() topa a montoBase, nunca negativo, y marca "topado"', () => {
    const s = src();
    const b = s.slice(s.indexOf('private calcularDescuento('), s.indexOf('// ── Generación de cargos'));
    expect(b).toContain('Math.min(Math.max(totalBruto, 0), montoBase)');
    expect(b).toContain("topado ? ';topado' : ''");
  });

  it('generarCargos() consulta becas aplicaA=colegiatura; generarMatricula() aplicaA=inscripcion', () => {
    const s = src();
    const cargos = s.slice(s.indexOf('async generarCargos('), s.indexOf('async generarMatricula('));
    const matricula = s.slice(s.indexOf('async generarMatricula('), s.indexOf('// ── Cargos'));
    expect(cargos).toContain("becasAplicables(empresaId, plan.estudianteId, plan.anioEscolarId, 'colegiatura')");
    expect(matricula).toContain("becasAplicables(empresaId, plan.estudianteId, plan.anioEscolarId, 'inscripcion')");
    // generarMatricula() no extiende plan.descuento — solo becas.
    expect(matricula).toContain('this.calcularDescuento(montoOriginal, 0, becas)');
  });
});

// ── Verificación real de punta a punta contra Postgres — requiere BD ─────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('becas — flujo real contra Postgres (con limpieza al final)', () => {
  let dataSource: DataSource;
  let becasSvc: BecasService;
  let colegiatura: ColegiaturaService;
  const EMPRESA = -889;

  const crearEstudiante = async (nombres: string) => {
    const [est] = await dataSource.query(
      `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES ($1, $2, 'Prueba') RETURNING id`,
      [EMPRESA, nombres],
    );
    return est.id as number;
  };

  const cargoColegiatura = async (planId: number) => {
    const [c] = await dataSource.query(
      `SELECT * FROM ed_cargos WHERE "planPagoId" = $1 AND tipo = 'colegiatura'`, [planId],
    );
    return c;
  };

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
    becasSvc = new BecasService(dataSource);
    colegiatura = new ColegiaturaService(dataSource, becasSvc);
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ed_cargos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_planes_pago WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_estudiante_becas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_becas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_estudiantes WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource?.destroy();
  });

  it('estudiante sin beca ni descuento de plan: cargos salen igual que antes (regresión)', async () => {
    const est = await crearEstudiante('SinBeca');
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 0 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    expect(Number(c.descuento)).toBe(0);
    expect(Number(c.montoTotal)).toBe(Number(c.montoOriginal));
    expect(c.concepto).toBeNull();
  });

  it("beca de porcentaje aplicaA='colegiatura': las cuotas bajan, la matrícula no", async () => {
    const beca = await becasSvc.createBeca(EMPRESA, { nombre: 'Pct Colegiatura', tipo: 'porcentaje', valor: 20, aplicaA: 'colegiatura' });
    const est = await crearEstudiante('BecaColegiatura');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 0 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    expect(Number(c.descuento)).toBe(200);
    expect(Number(c.montoTotal)).toBe(800);

    const cargoMat = await colegiatura.generarMatricula(EMPRESA, plan.id, 2102);
    expect(Number(cargoMat.descuento)).toBe(0);
  });

  it("beca de monto fijo aplicaA='inscripcion': solo la matrícula baja", async () => {
    const beca = await becasSvc.createBeca(EMPRESA, { nombre: 'Fija Inscripción', tipo: 'monto_fijo', valor: 500, aplicaA: 'inscripcion' });
    const est = await crearEstudiante('BecaInscripcion');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 0 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    expect(Number(c.descuento)).toBe(0);

    const cargoMat = await colegiatura.generarMatricula(EMPRESA, plan.id, 2102);
    expect(Number(cargoMat.descuento)).toBe(500);
    expect(Number(cargoMat.montoTotal)).toBe(300);
  });

  it("beca aplicaA='ambos' aplica a colegiatura y a matrícula", async () => {
    const beca = await becasSvc.createBeca(EMPRESA, { nombre: 'Ambos 15%', tipo: 'porcentaje', valor: 15, aplicaA: 'ambos' });
    const est = await crearEstudiante('BecaAmbos');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 0 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    expect(Number(c.descuento)).toBe(150);

    const cargoMat = await colegiatura.generarMatricula(EMPRESA, plan.id, 2102);
    expect(Number(cargoMat.descuento)).toBe(120);
  });

  it('dos becas sobre el mismo estudiante se suman sobre el monto original, no en cascada', async () => {
    const beca1 = await becasSvc.createBeca(EMPRESA, { nombre: 'Pct20', tipo: 'porcentaje', valor: 20, aplicaA: 'colegiatura' });
    const beca2 = await becasSvc.createBeca(EMPRESA, { nombre: 'Pct15Ambos', tipo: 'porcentaje', valor: 15, aplicaA: 'ambos' });
    const est = await crearEstudiante('DosBecas');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca1.id });
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca2.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 0 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    // 20% + 15% = 35% de 1000 = 350. En cascada sería 1000*0.8*0.85=680 → descuento 320. Deben diferir.
    expect(Number(c.descuento)).toBe(350);
    expect(c.concepto).toContain(`beca:${beca1.id}:200`);
    expect(c.concepto).toContain(`beca:${beca2.id}:150`);
  });

  it('beca(s) que superan el monto del cargo: se topa, nunca negativo, queda registrado "topado"', async () => {
    const beca = await becasSvc.createBeca(EMPRESA, { nombre: 'Enorme 90%', tipo: 'porcentaje', valor: 90, aplicaA: 'colegiatura' });
    const est = await crearEstudiante('BecaEnorme');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 20 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    // 20% (plan) + 90% (beca) = 110% bruto → topado a 100% (1000)
    expect(Number(c.descuento)).toBe(1000);
    expect(Number(c.montoTotal)).toBe(0);
    expect(c.concepto.endsWith(';topado')).toBe(true);
  });

  it('plan.descuento 10% + beca 20% dan 30% del original, no 10% y luego 20% sobre el resto', async () => {
    const beca = await becasSvc.createBeca(EMPRESA, { nombre: 'Pct20b', tipo: 'porcentaje', valor: 20, aplicaA: 'colegiatura' });
    const est = await crearEstudiante('PlanMasBeca');
    await becasSvc.asignarBeca(EMPRESA, { estudianteId: est, becaId: beca.id });
    const plan = await colegiatura.upsertPlan(EMPRESA, { estudianteId: est, anioEscolarId: null, montoColegiatura: 1000, montoMatricula: 800, descuento: 10 });
    await colegiatura.generarCargos(EMPRESA, plan.id, [1], 2102);
    const c = await cargoColegiatura(plan.id);
    expect(Number(c.descuento)).toBe(300); // no 280 (que daría la cascada)
    expect(Number(c.montoTotal)).toBe(700);
  });
});
