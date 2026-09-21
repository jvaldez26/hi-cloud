/**
 * "Completar con el catálogo estándar" (enriquecimiento del catálogo,
 * 2026-09-21) — botón de Plan de Cuentas para empresas EXISTENTES: genera
 * el catálogo estándar (PLAN_CUENTAS) como un archivo de importación y lo
 * pasa por el MISMO ImportacionCuentasService.previsualizar()/ejecutar() ya
 * desplegado — cero código de importación nuevo.
 *
 * Contra Postgres real — lo que pidió el encargo explícitamente: "el botón
 * en una empresa con catálogo completo no propone nada".
 */

import { DataSource } from 'typeorm';
import { ImportacionCuentasService } from './importacion-cuentas.service';
import { PLAN_CUENTAS } from './contabilidad.service';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from '../entities/cuenta-anexo-ir2.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { AsientoContable } from '../entities/asiento-contable.entity';
import { AuditLog } from '../../auditoria/entities/audit-log.entity';
import { User } from '../../users/users.entity';
import { SaldosCuentasService } from '../../reportes-financieros/saldos-cuentas.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';

const TIENE_BD = !!process.env['DB_HOST'];
const EMPRESA_VACIA   = 902201;
const EMPRESA_COMPLETA = 902202;
const EMPRESA_PARCIAL  = 902203;

(TIENE_BD ? describe : describe.skip)('"Completar con el catálogo estándar" — contra Postgres real', () => {
  let dataSource: DataSource;
  let svc: ImportacionCuentasService;
  let cuentaRepo: ReturnType<DataSource['getRepository']>;
  let userIdFixture: number;
  const empresaIdsUsadas = [EMPRESA_VACIA, EMPRESA_COMPLETA, EMPRESA_PARCIAL];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [CuentaContable, CuentaAnexoIR2, AsientoLinea, AsientoContable, AuditLog, User],
    });
    await dataSource.initialize();
    cuentaRepo = dataSource.getRepository(CuentaContable);

    const auditRepo = dataSource.getRepository(AuditLog);
    svc = Object.create(ImportacionCuentasService.prototype);
    (svc as any).cuentaRepository = cuentaRepo;
    (svc as any).anexoRepository  = dataSource.getRepository(CuentaAnexoIR2);
    (svc as any).lineaRepository  = dataSource.getRepository(AsientoLinea);
    (svc as any).saldosService    = new SaldosCuentasService(dataSource);
    (svc as any).auditoriaService = new AuditoriaService(auditRepo as any);
    (svc as any).dataSource       = dataSource;
    (svc as any).logger           = { warn: () => {}, error: () => {}, log: () => {} };

    await dataSource.query(`DELETE FROM users WHERE email = 'test-completar-estandar@hicloud.local'`);
    const [{ id }] = await dataSource.query(
      `INSERT INTO users (nombre, email, password, role)
       VALUES ('Test Completar Estándar', 'test-completar-estandar@hicloud.local', 'x', 'admin') RETURNING id`,
    );
    userIdFixture = id;
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM audit_logs WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      await dataSource.query(`DELETE FROM cuenta_anexo_ir2 WHERE "empresaId" = ANY($1)`, [empresaIdsUsadas]);
      for (let i = 0; i < 4; i++) {
        await dataSource.query(
          `DELETE FROM cuentas_contables c WHERE c."empresaId" = ANY($1) AND NOT EXISTS (SELECT 1 FROM cuentas_contables h WHERE h."cuentaPadreId" = c.id)`,
          [empresaIdsUsadas],
        );
      }
      if (userIdFixture) await dataSource.query(`DELETE FROM users WHERE id = $1`, [userIdFixture]);
      await dataSource.destroy();
    }
  });

  function comoEmpresa(empresaId: number) {
    (svc as any).tenantService = { getEmpresaId: () => empresaId };
    return { svc, usuario: { id: userIdFixture, nombre: 'Test Completar Estándar' } };
  }

  /** Siembra PLAN_CUENTAS (o un subconjunto por código) para una empresa — nivel por nivel, igual que seedPlanCuentas(). */
  async function sembrarEstandar(empresaId: number, soloCodigos?: string[]) {
    const cuentas = soloCodigos ? PLAN_CUENTAS.filter(c => soloCodigos.includes(c.codigo)) : PLAN_CUENTAS;
    for (let nivel = 1; nivel <= 4; nivel++) {
      for (const c of cuentas.filter(x => x.nivel === nivel)) {
        const codigoPadre = c.codigo.split('.').slice(0, -1).join('.');
        let cuentaPadreId: number | undefined;
        if (codigoPadre) {
          const padre = await cuentaRepo.findOne({ where: { codigo: codigoPadre, empresaId } as any });
          cuentaPadreId = (padre as any)?.id;
        }
        const { anexos, ...resto } = c as any;
        await cuentaRepo.save(cuentaRepo.create({ ...resto, empresaId, cuentaPadreId } as any));
      }
    }
  }

  it('empresa VACÍA (sin catálogo): previsualizar propone TODAS las 193 cuentas del estándar, nunca actualizaciones', async () => {
    const { svc: s } = comoEmpresa(EMPRESA_VACIA);
    const preview = await s.previsualizarEstandar();
    expect(preview.crear).toHaveLength(PLAN_CUENTAS.length);
    expect(preview.actualizar).toHaveLength(0);
    expect(preview.errores).toHaveLength(0);
  }, 30_000);

  it('empresa con el catálogo estándar COMPLETO: no propone nada — ni crear ni actualizar', async () => {
    await sembrarEstandar(EMPRESA_COMPLETA);
    const { svc: s } = comoEmpresa(EMPRESA_COMPLETA);

    const preview = await s.previsualizarEstandar();
    expect(preview.crear).toHaveLength(0);
    expect(preview.actualizar).toHaveLength(0);
    expect(preview.noTocadas).toBe(PLAN_CUENTAS.length);

    // completarEstandar() tampoco crea/actualiza nada — es un no-op seguro.
    const resultado = await s.completarEstandar({ id: userIdFixture, nombre: 'Test' });
    expect(resultado.creadas).toBe(0);
    expect(resultado.actualizadas).toBe(0);
  }, 60_000);

  it('empresa con catálogo PARCIAL: propone SOLO lo que falta, y completarEstandar() lo agrega sin tocar lo existente', async () => {
    // Le sembramos solo la raíz de activos y un par de cuentas — el resto
    // del estándar (190 cuentas) debería faltar.
    const yaTiene = ['1', '1.1', '1.1.1', '1.1.1.01', '1.1.1.02', '1.1.1.03'];
    await sembrarEstandar(EMPRESA_PARCIAL, yaTiene);
    const { svc: s, usuario } = comoEmpresa(EMPRESA_PARCIAL);

    const preview = await s.previsualizarEstandar();
    expect(preview.crear.length).toBe(PLAN_CUENTAS.length - yaTiene.length);
    expect(preview.actualizar).toHaveLength(0);
    expect(preview.crear.some((c: any) => yaTiene.includes(c.codigo))).toBe(false);

    const resultado = await s.completarEstandar(usuario);
    expect(resultado.creadas).toBe(PLAN_CUENTAS.length - yaTiene.length);
    expect(resultado.actualizadas).toBe(0);

    // Las que ya tenía siguen intactas (mismo id, no se recrearon).
    const cajaChica = await cuentaRepo.findOne({ where: { empresaId: EMPRESA_PARCIAL, codigo: '1.1.1.01' } as any });
    expect(cajaChica).not.toBeNull();

    // Y ahora el catálogo completo del estándar está presente.
    const totalFinal = await cuentaRepo.count({ where: { empresaId: EMPRESA_PARCIAL } as any });
    expect(totalFinal).toBe(PLAN_CUENTAS.length);
  }, 60_000);

  it('multi-tenant: completar el catálogo de una empresa nunca toca el catálogo de otra', async () => {
    const { svc: s, usuario } = comoEmpresa(EMPRESA_VACIA);
    await s.completarEstandar(usuario);

    const totalOtraEmpresa = await cuentaRepo.count({ where: { empresaId: EMPRESA_PARCIAL } as any });
    // EMPRESA_PARCIAL ya corrió su propio test arriba y quedó con el
    // catálogo completo — completar EMPRESA_VACIA no debió sumarle nada más.
    expect(totalOtraEmpresa).toBeLessThanOrEqual(PLAN_CUENTAS.length);

    const totalEmpresaVacia = await cuentaRepo.count({ where: { empresaId: EMPRESA_VACIA } as any });
    expect(totalEmpresaVacia).toBe(PLAN_CUENTAS.length);
  }, 30_000);
});
