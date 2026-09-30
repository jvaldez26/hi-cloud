import { ForbiddenException } from '@nestjs/common';
import { execSync } from 'child_process';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkEstadoReceptor, XlinkTipoDocumento } from './entities/xlink-documento.entity';

/**
 * xlink_documentos no tiene `empresaId` (pertenece a DOS empresas) y por eso
 * queda AFUERA del TenantSubscriber/TenantAwareRepository — el aislamiento
 * lo hace este repositorio a mano. Estos tests verifican:
 *
 * 1. Cada método exige el eid del CLS y filtra por el lado correcto
 *    (origenEmpresaId / destinoEmpresaId / cualquiera de los dos).
 * 2. Test ESTRUCTURAL (mismo patrón que tenant-aware.repository.spec.ts
 *    "CI check — no fallback 1=1"): ningún archivo fuera de este módulo
 *    puede referenciar `XlinkDocumento`/`xlink_documentos` directo.
 */

function makeRepoMock() {
  return {
    findOne: jest.fn(),
    count:   jest.fn(),
    create:  jest.fn((d: any) => d),
    save:    jest.fn((e: any) => Promise.resolve(e)),
    createQueryBuilder: jest.fn(),
    manager: { getRepository: jest.fn() },
  };
}

function makeTenantSvc(empresaId: number) {
  return { getEmpresaId: () => empresaId };
}

describe('XlinkDocumentosRepository — aislamiento por eid (sin empresaId propio)', () => {
  it('crear(): origenEmpresaId sale SIEMPRE del CLS, nunca del caller', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.crear({ origenEmpresaId: 999, destinoEmpresaId: 2 } as any);

    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ origenEmpresaId: 7, destinoEmpresaId: 2 }),
    );
  });

  it('buscarPorId(): filtra por (origenEmpresaId = eid OR destinoEmpresaId = eid)', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorId(42);

    expect(repoMock.findOne).toHaveBeenCalledWith({
      where: [{ id: 42, origenEmpresaId: 7 }, { id: 42, destinoEmpresaId: 7 }],
    });
  });

  it('buscarPorIdComoDestino(): filtra SOLO por destinoEmpresaId', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorIdComoDestino(42);

    expect(repoMock.findOne).toHaveBeenCalledWith({ where: { id: 42, destinoEmpresaId: 7 } });
  });

  it('buscarPorIdComoOrigen(): filtra SOLO por origenEmpresaId', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorIdComoOrigen(42);

    expect(repoMock.findOne).toHaveBeenCalledWith({ where: { id: 42, origenEmpresaId: 7 } });
  });

  it('buscarPorOrigenParaAnular(): filtra por origenEmpresaId + tipoDocumento + documentoOrigenId', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorOrigenParaAnular(XlinkTipoDocumento.FACTURA_CREDITO, 100);

    expect(repoMock.findOne).toHaveBeenCalledWith({
      where: { origenEmpresaId: 7, tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoOrigenId: 100 },
    });
  });

  it('buscarPorOrigenComoDestino(): filtra por destinoEmpresaId + origenEmpresaId + tipo/id origen', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorOrigenComoDestino(3, XlinkTipoDocumento.FACTURA_CREDITO, 55);

    expect(repoMock.findOne).toHaveBeenCalledWith({
      where: { destinoEmpresaId: 7, origenEmpresaId: 3, tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoOrigenId: 55 },
    });
  });

  it('buscarPorDocumentoGeneradoComoDestino(): filtra por destinoEmpresaId + tipo/id generado', async () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    await repo.buscarPorDocumentoGeneradoComoDestino('cotizacion', 55);

    expect(repoMock.findOne).toHaveBeenCalledWith({
      where: { destinoEmpresaId: 7, documentoGeneradoTipo: 'cotizacion', documentoGeneradoId: 55 },
    });
  });

  it('existePorOrigen(): cuenta solo dentro del origenEmpresaId del CLS', async () => {
    const repoMock = makeRepoMock();
    repoMock.count.mockResolvedValue(1);
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    const existe = await repo.existePorOrigen(XlinkTipoDocumento.FACTURA_CREDITO, 100);

    expect(existe).toBe(true);
    expect(repoMock.count).toHaveBeenCalledWith({
      where: { origenEmpresaId: 7, tipoDocumento: XlinkTipoDocumento.FACTURA_CREDITO, documentoOrigenId: 100 },
    });
  });

  it('contarPendientesComoDestino(): cuenta solo pendientes del destinoEmpresaId del CLS', async () => {
    const repoMock = makeRepoMock();
    repoMock.count.mockResolvedValue(3);
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);

    const n = await repo.contarPendientesComoDestino();

    expect(n).toBe(3);
    expect(repoMock.count).toHaveBeenCalledWith({
      where: { destinoEmpresaId: 7, estadoReceptor: XlinkEstadoReceptor.PENDIENTE },
    });
  });

  it('assertPerteneceAEmpresaActual(): rechaza un documento que no es ni origen ni destino de la empresa activa', () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(7) as any);
    const doc = { origenEmpresaId: 1, destinoEmpresaId: 2 } as any;

    expect(() => repo.assertPerteneceAEmpresaActual(doc)).toThrow(ForbiddenException);
  });

  it('assertPerteneceAEmpresaActual(): rechaza destino cuando la empresa activa es el origen y se exige destino', () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(1) as any);
    const doc = { origenEmpresaId: 1, destinoEmpresaId: 2 } as any;

    expect(() => repo.assertPerteneceAEmpresaActual(doc, 'destino')).toThrow(ForbiddenException);
  });

  it('assertPerteneceAEmpresaActual(): acepta cuando la empresa activa es cualquiera de los dos lados', () => {
    const repoMock = makeRepoMock();
    const repo = new XlinkDocumentosRepository(repoMock as any, makeTenantSvc(2) as any);
    const doc = { origenEmpresaId: 1, destinoEmpresaId: 2 } as any;

    expect(() => repo.assertPerteneceAEmpresaActual(doc)).not.toThrow();
  });
});

// ── Test estructural: acceso exclusivo a xlink_documentos ────────────────────

describe('CI check — xlink_documentos solo se consulta desde xlink-documentos.repository.ts', () => {
  it('ningún otro archivo usa @InjectRepository(XlinkDocumento) o getRepository(XlinkDocumento)', () => {
    let salida = '';
    try {
      salida = execSync(
        'grep -rn "InjectRepository(XlinkDocumento)\\|getRepository(XlinkDocumento)\\|getRepositoryToken(XlinkDocumento)" src/ --include="*.ts" --exclude-dir=node_modules',
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch {
      return; // grep exit 1 = no matches en absoluto, ni siquiera el repositorio — imposible aquí, pero no es un fallo
    }

    const hallazgos = salida
      .split('\n')
      .filter(Boolean)
      .filter(linea => !linea.includes('src/xlink/xlink-documentos.repository.ts'))
      .filter(linea => !linea.includes('src/xlink/xlink.module.ts')) // TypeOrmModule.forFeature registra la entidad, no la consulta
      .filter(linea => !linea.includes('xlink-documentos.repository.spec.ts'))
      .filter(linea => {
        // Comentarios que ADVIERTEN contra el patrón (documentación) no cuentan —
        // mismo criterio que tenant-aware.repository.spec.ts.
        const codigo = linea.replace(/^[^:]+:\d+:/, '').trim();
        return !(codigo.startsWith('*') || codigo.startsWith('//') || codigo.startsWith('/*'));
      });

    if (hallazgos.length > 0) {
      throw new Error(
        `xlink_documentos se está consultando fuera de XlinkDocumentosRepository — prohibido:\n${hallazgos.join('\n')}`,
      );
    }
  });

  it('ningún archivo hace SQL crudo contra la tabla "xlink_documentos" (raw query bypass)', () => {
    let salida = '';
    try {
      salida = execSync(
        'grep -rln "FROM xlink_documentos\\|FROM \\"xlink_documentos\\"\\|INTO xlink_documentos\\|UPDATE xlink_documentos" src/ --include="*.ts" --exclude-dir=node_modules -i',
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch {
      return; // sin coincidencias — correcto, nadie hace SQL crudo contra la tabla
    }

    const hallazgos = salida
      .split('\n')
      .filter(Boolean)
      .filter(f => !f.includes('xlink-documentos.repository.spec.ts'));

    if (hallazgos.length > 0) {
      throw new Error(`SQL crudo contra xlink_documentos fuera del repositorio en:\n${hallazgos.join('\n')}`);
    }
  });
});
