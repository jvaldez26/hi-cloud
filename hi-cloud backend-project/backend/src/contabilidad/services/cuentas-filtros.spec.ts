/**
 * UI — filtros por clasificación y estado en Plan de Cuentas (2026-09-21).
 *
 * getCuentas() ahora arma la query con QueryBuilder (para combinar
 * clasificación/estado/búsqueda) y devuelve {data, conteos}. La parte
 * estructural (empresaId primero, fail-closed) ya la prueba
 * eid-falla-cerrado.spec.ts con mocks; ESTE archivo prueba la SEMÁNTICA real
 * de cada filtro — clasificación por tipo, estado (activas/inactivas/grupo),
 * búsqueda, combinaciones, y aislamiento multi-tenant — contra Postgres real
 * (TIENE_BD, se salta en CI). Un EXISTS mal escrito o un ILIKE con el
 * carácter equivocado no se detectan con mocks.
 */

import { DataSource } from 'typeorm';
import { ContabilidadService } from './contabilidad.service';
import { CuentaContable, TipoCuenta, NaturalezaCuenta } from '../entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from '../entities/cuenta-anexo-ir2.entity';

const TIENE_BD = !!process.env['DB_HOST'];

const EMPRESA_A = 901101;
const EMPRESA_B = 901102;

(TIENE_BD ? describe : describe.skip)('ContabilidadService.getCuentas() — filtros y conteos, contra Postgres real', () => {
  let dataSource: DataSource;
  let svc: ContabilidadService;
  const idsCreados: number[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CuentaContable, CuentaAnexoIR2],
    });
    await dataSource.initialize();

    svc = Object.create(ContabilidadService.prototype);
    (svc as any).cuentaRepository = dataSource.getRepository(CuentaContable);
    (svc as any).anexoRepository  = dataSource.getRepository(CuentaAnexoIR2);

    const cuentaRepo = dataSource.getRepository(CuentaContable);

    // Empresa A — el universo real de la prueba.
    const raiz = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.1', nombre: 'Activo Filtros Test', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: false, isActive: true,
    }));
    const hija = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.1.1', nombre: 'Caja Filtros Test', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 2, permiteMovimientos: true, isActive: true,
      cuentaPadreId: raiz.id,
    }));
    // Grupo SIN hijas — permiteMovimientos=false pero no debe contar como "grupo".
    const grupoVacio = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.2', nombre: 'Pasivo Filtros Test (sin hijas)', tipo: TipoCuenta.PASIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: false, isActive: true,
    }));
    const inactiva = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.4', nombre: 'Ingresos Filtros Test (inactiva)', tipo: TipoCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA, nivel: 1, permiteMovimientos: true, isActive: false,
    }));
    const gasto = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_A, codigo: '9.6', nombre: 'Gastos Varios Filtros Test', tipo: TipoCuenta.GASTO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: true, isActive: true,
    }));

    // Empresa B — solo para probar que NUNCA se cuela en los resultados/conteos de A.
    const otraEmpresa = await cuentaRepo.save(cuentaRepo.create({
      empresaId: EMPRESA_B, codigo: '9.9', nombre: 'Cuenta de Otra Empresa', tipo: TipoCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA, nivel: 1, permiteMovimientos: true, isActive: true,
    }));

    idsCreados.push(raiz.id, hija.id, grupoVacio.id, inactiva.id, gasto.id, otraEmpresa.id);
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const repo = dataSource.getRepository(CuentaContable);
      for (const id of idsCreados) await repo.delete(id).catch(() => {});
      await dataSource.destroy();
    }
  });

  function comoEmpresa(empresaId: number) {
    (svc as any).tenantService = { getEmpresaId: () => empresaId };
    return svc;
  }

  it('clasificacion=activos: solo cuentas tipo activo de la empresa activa', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ clasificacion: 'activos' });
    const codigos = r.data.map(c => c.codigo).sort();
    expect(codigos).toEqual(['9.1', '9.1.1']);
  });

  it('clasificacion=capital (patrimonio en el modelo): sin resultados en este fixture, sin explotar', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ clasificacion: 'capital' });
    expect(r.data.every(c => c.tipo === TipoCuenta.PATRIMONIO)).toBe(true);
  });

  it('estado=grupo: solo la cuenta con permiteMovimientos=false Y al menos una hija — NO la que no tiene hijas', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ estado: 'grupo' });
    const codigos = r.data.map(c => c.codigo);
    expect(codigos).toContain('9.1');       // tiene hija (9.1.1)
    expect(codigos).not.toContain('9.2');   // permiteMovimientos=false pero sin hijas
  });

  it('estado=inactivas: solo la cuenta inactiva', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ estado: 'inactivas' });
    expect(r.data.map(c => c.codigo)).toEqual(['9.4']);
  });

  it('sin estado (default): NO trae la inactiva — mismo comportamiento de siempre', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({});
    expect(r.data.map(c => c.codigo)).not.toContain('9.4');
  });

  it('estado=todas: SÍ trae la inactiva junto con las activas', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ estado: 'todas' });
    expect(r.data.map(c => c.codigo)).toContain('9.4');
  });

  it('clasificación + estado combinados (gastos + activas)', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ clasificacion: 'gastos', estado: 'activas' });
    expect(r.data.map(c => c.codigo)).toEqual(['9.6']);
  });

  it('búsqueda por nombre: combina con clasificación', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ search: 'Caja', clasificacion: 'activos' });
    expect(r.data.map(c => c.codigo)).toEqual(['9.1.1']);
  });

  it('búsqueda por código', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ search: '9.6' });
    expect(r.data.map(c => c.codigo)).toEqual(['9.6']);
  });

  it('conteos: reflejan la búsqueda pero NO la clasificación/estado ya elegidos (faceted)', async () => {
    const filtrado = await comoEmpresa(EMPRESA_A).getCuentas({ clasificacion: 'gastos' });
    const sinFiltro = await comoEmpresa(EMPRESA_A).getCuentas({});
    // El conteo de "activos" en la respuesta filtrada por "gastos" debe ser
    // el mismo que sin ningún filtro de clasificación — no cae a 0.
    expect(filtrado.conteos.clasificacion.activos).toBe(sinFiltro.conteos.clasificacion.activos);
    expect(filtrado.conteos.clasificacion.gastos).toBeGreaterThanOrEqual(1);
  });

  it('conteos.estado.grupo cuenta solo cuentas grupo con hijas, igual que el filtro', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ estado: 'todas' });
    expect(r.conteos.estado.grupo).toBeGreaterThanOrEqual(1);
  });

  it('multi-tenant: la cuenta de la Empresa B nunca aparece en los resultados ni en los conteos de la Empresa A', async () => {
    const r = await comoEmpresa(EMPRESA_A).getCuentas({ estado: 'todas' });
    expect(r.data.some(c => c.codigo === '9.9')).toBe(false);

    const rB = await comoEmpresa(EMPRESA_B).getCuentas({ estado: 'todas' });
    expect(rB.data.map(c => c.codigo)).toEqual(['9.9']);
    // Los conteos de B tampoco arrastran nada de A.
    expect(rB.conteos.clasificacion.activos).toBe(1);
  });
});
