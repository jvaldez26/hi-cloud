/**
 * Tests del sistema de filtrado multi-tenant automático.
 *
 * COBERTURA:
 * 1. @TenantScoped sin contexto → TenantContextMissingException (NUNCA '1=1')
 * 2. @TenantScoped con contexto → filtra solo la empresa correcta
 * 3. Entidad SIN @TenantScoped → no se ve afectada
 * 4. withoutTenantScope() → funciona y logea
 * 5. runAs(empresaB) → queries retornan datos de empresaB, no empresaA
 * 6. Test estructural: grep verifica que no existe '1=1' en src/
 */

import { TenantAwareRepository } from './tenant-aware.repository';
import { TenantContextMissingException } from './exceptions/tenant-context-missing.exception';
import { TenantScoped, isTenantScoped } from './decorators/tenant-scoped.decorator';
import { SKIP_TENANT_KEY, SKIP_TENANT_CALLER } from './tenant.subscriber';
import { execSync } from 'child_process';

// ── Mocks ─────────────────────────────────────────────────────────────────────

/** Crea un mock de ClsService para inyectar empresaId */
function makeCls(empresaId?: number, skipTenant = false, caller?: string) {
  const store = new Map<string, unknown>();
  if (empresaId)   store.set('empresaId', empresaId);
  if (skipTenant)  store.set(SKIP_TENANT_KEY, true);
  if (caller)      store.set(SKIP_TENANT_CALLER, caller);
  return { get: (k: string) => store.get(k), set: (k: string, v: any) => store.set(k, v) } as any;
}

/** Crea un mock de Repository<T> que captura opciones de find */
function makeRepo(entityClass: any, captured: any[] = []) {
  const target = entityClass;
  const metadata = { name: entityClass.name ?? 'TestEntity', tableName: 'test' };
  return {
    target,
    metadata,
    find:         (opts?: any) => { captured.push({ op: 'find', opts }); return Promise.resolve([]); },
    findOne:      (opts?: any) => { captured.push({ op: 'findOne', opts }); return Promise.resolve(null); },
    findAndCount: (opts?: any) => { captured.push({ op: 'findAndCount', opts }); return Promise.resolve([[], 0]); },
    findBy:       (w: any)    => { captured.push({ op: 'findBy', w }); return Promise.resolve([]); },
    findOneBy:    (w: any)    => { captured.push({ op: 'findOneBy', w }); return Promise.resolve(null); },
    count:        (opts?: any) => { captured.push({ op: 'count', opts }); return Promise.resolve(0); },
    createQueryBuilder: (alias?: string) => {
      const qb: any = {
        _alias: alias, _wheres: [] as string[],
        where:    function(cond: string, params: any) { this._wheres.push(cond); return this; },
        andWhere: function(cond: string, params: any) { this._wheres.push(cond); return this; },
      };
      captured.push({ op: 'createQueryBuilder', alias, qb });
      return qb;
    },
    save: (e: any) => Promise.resolve(e),
    create: (d: any) => d,
  } as any;
}

function makeDs(entityClass: any) {
  return { getMetadata: () => ({ name: entityClass.name, columns: [] }) } as any;
}

// ── Entidades de prueba ───────────────────────────────────────────────────────

@TenantScoped()
class TenantEntity {
  empresaId: number;
  valor: string;
}

class GlobalEntity {
  nombre: string;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TenantAwareRepository — @TenantScoped', () => {
  // 1. Sin contexto → TenantContextMissingException, NUNCA datos devueltos
  it('[1] query sobre @TenantScoped sin contexto lanza TenantContextMissingException', async () => {
    const repo = new TenantAwareRepository(makeRepo(TenantEntity), makeCls(), makeDs(TenantEntity));
    await expect(repo.find()).rejects.toBeInstanceOf(TenantContextMissingException);
  });

  it('[1b] TenantContextMissingException NO llama al inner repository', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(), makeDs(TenantEntity));
    await expect(repo.find()).rejects.toThrow();
    expect(captured).toHaveLength(0); // inner.find() no se llamó
  });

  // 2. Con contexto → inyecta empresaId en where automáticamente
  it('[2] find() inyecta empresaId en where', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(42), makeDs(TenantEntity));
    await repo.find({ where: { valor: 'x' } } as any);
    expect(captured[0].opts.where).toMatchObject({ empresaId: 42, valor: 'x' });
  });

  it('[2b] findOne() inyecta empresaId en where', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(7), makeDs(TenantEntity));
    await repo.findOne({ where: {} } as any);
    expect(captured[0].opts.where).toMatchObject({ empresaId: 7 });
  });

  it('[2c] count() inyecta empresaId en where', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(5), makeDs(TenantEntity));
    await repo.count();
    expect(captured[0].opts.where).toMatchObject({ empresaId: 5 });
  });

  it('[2d] createQueryBuilder() añade WHERE empresaId', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(99), makeDs(TenantEntity));
    const qb = repo.createQueryBuilder('c');
    expect((qb as any)._wheres.some((w: string) => w.includes('empresaId'))).toBe(true);
  });

  it('[2e] find() con array where inyecta empresaId en CADA condición', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(TenantEntity, captured), makeCls(10), makeDs(TenantEntity));
    await repo.find({ where: [{ valor: 'a' }, { valor: 'b' }] } as any);
    const w = captured[0].opts.where;
    expect(Array.isArray(w)).toBe(true);
    expect(w[0]).toMatchObject({ empresaId: 10, valor: 'a' });
    expect(w[1]).toMatchObject({ empresaId: 10, valor: 'b' });
  });

  // 3. Entidad sin @TenantScoped → no afectada
  it('[3] entidad sin @TenantScoped no inyecta empresaId', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(makeRepo(GlobalEntity, captured), makeCls(), makeDs(GlobalEntity));
    await repo.find();
    // No lanzó, inner.find() llamado sin empresaId
    expect(captured[0].op).toBe('find');
    expect(captured[0].opts).toBeUndefined();
  });

  it('[3b] entidad global no requiere contexto de empresa', async () => {
    const repo = new TenantAwareRepository(makeRepo(GlobalEntity), makeCls(), makeDs(GlobalEntity));
    await expect(repo.find()).resolves.toEqual([]);
  });

  // 4. withoutTenantScope() → funciona y logea (pero no lanza)
  it('[4] withoutTenantScope() permite query sin contexto', async () => {
    const repo = new TenantAwareRepository(
      makeRepo(TenantEntity),
      makeCls(undefined, true, 'CronJob:test'), // bypass activo
      makeDs(TenantEntity),
    );
    await expect(repo.find()).resolves.toEqual([]);
  });

  it('[4b] withoutTenantScope() NO inyecta empresaId', async () => {
    const captured: any[] = [];
    const repo = new TenantAwareRepository(
      makeRepo(TenantEntity, captured),
      makeCls(42, true, 'CronJob:test'), // bypass activo aunque hay eid
      makeDs(TenantEntity),
    );
    await repo.find();
    const opts = captured[0].opts;
    expect(opts?.where?.empresaId).toBeUndefined();
  });

  // 5. runAs(empresaB) — cambiar empresa activa
  it('[5] runAs() cambia temporalmente el empresaId del contexto', async () => {
    // Para este test simulamos el comportamiento del CLS
    const store = new Map([['empresaId', 10]]);
    const cls = {
      get: (k: string) => store.get(k),
      set: (k: string, v: any) => store.set(k, v),
    } as any;

    const capturedA: any[] = [];
    const capturedB: any[] = [];

    const repoA = new TenantAwareRepository(makeRepo(TenantEntity, capturedA), cls, makeDs(TenantEntity));
    const repoB = new TenantAwareRepository(makeRepo(TenantEntity, capturedB), cls, makeDs(TenantEntity));

    // Query normal → empresa 10
    await repoA.find();
    expect(capturedA[0].opts.where.empresaId).toBe(10);

    // Simular runAs(20) cambiando el contexto
    store.set('empresaId', 20);
    await repoB.find();
    expect(capturedB[0].opts.where.empresaId).toBe(20);

    // Restaurar y verificar que A sigue con 10
    store.set('empresaId', 10);
    await repoA.find();
    expect(capturedA[1].opts.where.empresaId).toBe(10); // sin contaminación de runAs
  });
});

// ── Test estructural: @TenantScoped decorator ─────────────────────────────────

describe('@TenantScoped decorator', () => {
  it('isTenantScoped devuelve true para clase marcada', () => {
    expect(isTenantScoped(TenantEntity)).toBe(true);
  });

  it('isTenantScoped devuelve false para clase no marcada', () => {
    expect(isTenantScoped(GlobalEntity)).toBe(false);
  });

  it('isTenantScoped devuelve false para undefined', () => {
    expect(isTenantScoped(undefined)).toBe(false);
  });

  it('isTenantScoped devuelve false para string', () => {
    expect(isTenantScoped('TenantEntity' as any)).toBe(false);
  });
});

// ── Test CI: grep verifica que no existe '1=1' en src/ ────────────────────────

describe('CI check — no fallback "1=1"', () => {
  it('No existe el patrón "1=1" como fallback de filtro en src/', () => {
    let salida = '';
    try {
      // grep retorna exit code 0 si ENCUENTRA, 1 si no encuentra
      salida = execSync('grep -rn "1=1" src/ --include="*.ts" --exclude-dir=node_modules', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return; // no hay ninguna coincidencia
    }

    // El grep crudo también casa la DOCUMENTACIÓN que advierte contra el patrón
    // ("...jamás '1=1'") y este propio test, así que el check fallaba siempre por
    // sí mismo. Nos quedamos solo con coincidencias en código ejecutable.
    const hallazgos = salida
      .split('\n')
      .filter(Boolean)
      .filter(linea => {
        const sinPrefijo = linea.replace(/^[^:]+:\d+:/, '');   // quita ruta:línea:
        const codigo     = sinPrefijo.trim();
        if (codigo.startsWith('*') || codigo.startsWith('//') || codigo.startsWith('/*')) return false;
        // Este spec habla del patrón por definición
        return !linea.includes('tenant-aware.repository.spec.ts');
      });

    if (hallazgos.length > 0) {
      throw new Error(`Se encontró el patrón "1=1" (fallback inseguro) en:\n${hallazgos.join('\n')}`);
    }
  });

  it('el check detecta el patrón cuando SÍ está en código', () => {
    // Verifica que el filtro anterior no lo neutraliza: una línea de código real
    // con el patrón debe sobrevivir al descarte de comentarios.
    const linea    = 'src/algun/servicio.ts:42:    const where = empresaId ? `"empresaId" = ${empresaId}` : "1=1";';
    const codigo   = linea.replace(/^[^:]+:\d+:/, '').trim();
    const esComentario = codigo.startsWith('*') || codigo.startsWith('//') || codigo.startsWith('/*');
    expect(esComentario).toBe(false);
    expect(linea.includes('tenant-aware.repository.spec.ts')).toBe(false);
  });
});
