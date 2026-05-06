import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ENCFGeneratorService } from './encf-generator.service';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { TipoECF } from '../entities/tipo-ecf.entity';
import {
  EcfSecuenciaSinConfigError,
  EcfSecuenciaAgotadaError,
  EcfSecuenciaVencidaError,
} from '../errors/ecf.errors';

// ── Helpers de mocks ──────────────────────────────────────────────────────────

function makeTipo(codigo: string, prefijo: string, id = 2): TipoECF {
  return { id, codigo, prefijo, descripcion: 'Test', requiereRNC: false, aplicaITBIS: true } as TipoECF;
}

function makeSecuencia(opts: {
  id?: number; secuenciaActual?: number; secuenciaInicial?: number;
  secuenciaFinal?: number; fechaVencimiento?: Date; isActiva?: boolean; isAgotada?: boolean;
} = {}): SecuenciaECF {
  return {
    id:               opts.id ?? 1,
    empresaId:        1,
    tipoECFId:        2,
    secuenciaInicial: opts.secuenciaInicial ?? 1,
    secuenciaFinal:   opts.secuenciaFinal ?? 100,
    secuenciaActual:  opts.secuenciaActual ?? 1,
    fechaVencimiento: opts.fechaVencimiento ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    isActiva:         opts.isActiva ?? true,
    isAgotada:        opts.isAgotada ?? false,
    alertaEnviada:    false,
    isActive:         true,
    createdAt:        new Date(),
    updatedAt:        new Date(),
    tipoECF:          makeTipo('E32', 'E32'),
  } as SecuenciaECF;
}

function makeManagerMock(secuencia: SecuenciaECF | null) {
  const updates: { id: number; data: any }[] = [];
  return {
    createQueryBuilder: jest.fn().mockReturnValue({
      setLock: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(secuencia),
    }),
    update: jest.fn().mockImplementation((entity, id, data) => {
      updates.push({ id, data });
      return Promise.resolve();
    }),
    findOne: jest.fn().mockResolvedValue(makeTipo('E32', 'E32')),
    _updates: updates,
  };
}

// ── Construcción del servicio bajo test ───────────────────────────────────────

async function buildService(
  tipoResult: TipoECF | null,
  secResult: SecuenciaECF | null,
) {
  const manager = makeManagerMock(secResult);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ENCFGeneratorService,
      {
        provide: getRepositoryToken(SecuenciaECF),
        useValue: { findOne: jest.fn() },
      },
      {
        provide: getRepositoryToken(TipoECF),
        useValue: {
          findOne: jest.fn().mockResolvedValue(tipoResult),
        },
      },
      {
        provide: DataSource,
        useValue: {
          transaction: jest.fn().mockImplementation((fn: (m: EntityManager) => any) => fn(manager as any)),
          getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(tipoResult) }),
        },
      },
    ],
  }).compile();

  return {
    svc: module.get<ENCFGeneratorService>(ENCFGeneratorService),
    manager,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ENCFGeneratorService', () => {

  describe('formato del eNCF', () => {
    it('genera formato correcto: prefijo + 10 dígitos = 13 chars', async () => {
      const { svc } = await buildService(makeTipo('E32', 'E32'), makeSecuencia());
      const encf = await svc.generateNext(1, 32);
      expect(encf).toHaveLength(13);
      expect(encf).toBe('E320000000001');
    });

    it('padding correcto para número 999', async () => {
      const { svc } = await buildService(
        makeTipo('E31', 'E31', 1),
        makeSecuencia({ secuenciaActual: 999, secuenciaFinal: 10_000 }),
      );
      const encf = await svc.generateNext(1, 31);
      expect(encf).toBe('E310000000999');
    });

    it('padding correcto para número 10 (borde de dígitos)', async () => {
      const { svc } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ secuenciaActual: 10, secuenciaFinal: 100 }),
      );
      expect(await svc.generateNext(1, 32)).toBe('E320000000010');
    });

    it('número máximo del rango (10 dígitos = 9999999999)', async () => {
      const { svc } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ secuenciaActual: 9_999_999_999, secuenciaFinal: 9_999_999_999 }),
      );
      const encf = await svc.generateNext(1, 32);
      expect(encf).toBe('E329999999999');
      expect(encf).toHaveLength(13);
    });
  });

  describe('incremento atómico del contador', () => {
    it('incrementa secuenciaActual de 1 a 2', async () => {
      const { svc, manager } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ secuenciaActual: 1 }),
      );
      await svc.generateNext(1, 32);
      const updateCall = manager.update.mock.calls[0];
      expect(updateCall[2].secuenciaActual).toBe(2);
    });

    it('marca isAgotada cuando se usa el último número', async () => {
      const { svc, manager } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ secuenciaActual: 100, secuenciaFinal: 100 }),
      );
      await svc.generateNext(1, 32);
      const updateCall = manager.update.mock.calls[0];
      expect(updateCall[2].isAgotada).toBe(true);
      expect(updateCall[2].isActiva).toBe(false);
    });
  });

  describe('manejo de errores tipados', () => {
    it('lanza EcfSecuenciaSinConfigError si el tipo no existe', async () => {
      const { svc } = await buildService(null, null);
      await expect(svc.generateNext(1, 32)).rejects.toThrow(EcfSecuenciaSinConfigError);
    });

    it('lanza EcfSecuenciaSinConfigError si no hay secuencia activa', async () => {
      const { svc } = await buildService(makeTipo('E32', 'E32'), null);
      await expect(svc.generateNext(1, 32)).rejects.toThrow(EcfSecuenciaSinConfigError);
    });

    it('lanza EcfSecuenciaVencidaError si la fecha de vencimiento expiró', async () => {
      const fechaPasada = new Date('2020-01-01');
      const { svc } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ fechaVencimiento: fechaPasada }),
      );
      await expect(svc.generateNext(1, 32)).rejects.toThrow(EcfSecuenciaVencidaError);
    });

    it('lanza EcfSecuenciaAgotadaError si secuenciaActual > secuenciaFinal', async () => {
      const { svc } = await buildService(
        makeTipo('E32', 'E32'),
        makeSecuencia({ secuenciaActual: 101, secuenciaFinal: 100 }),
      );
      await expect(svc.generateNext(1, 32)).rejects.toThrow(EcfSecuenciaAgotadaError);
    });
  });

  describe('secuencialidad (sin concurrencia)', () => {
    it('genera 5 llamadas secuenciales con números únicos y consecutivos', async () => {
      let contador = 1;
      const manager = {
        createQueryBuilder: jest.fn().mockImplementation(() => ({
          setLock:             jest.fn().mockReturnThis(),
          innerJoinAndSelect:  jest.fn().mockReturnThis(),
          where:               jest.fn().mockReturnThis(),
          andWhere:            jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(() =>
            Promise.resolve(makeSecuencia({ secuenciaActual: contador, secuenciaFinal: 1000 })),
          ),
        })),
        update: jest.fn().mockImplementation(() => { contador++; return Promise.resolve(); }),
        findOne: jest.fn().mockResolvedValue(makeTipo('E32', 'E32')),
      };

      const module = await Test.createTestingModule({
        providers: [
          ENCFGeneratorService,
          { provide: getRepositoryToken(SecuenciaECF), useValue: {} },
          { provide: getRepositoryToken(TipoECF),     useValue: { findOne: jest.fn().mockResolvedValue(makeTipo('E32', 'E32')) } },
          {
            provide: DataSource,
            useValue: {
              transaction: jest.fn().mockImplementation((fn: any) => fn(manager)),
              getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(makeTipo('E32', 'E32')) }),
            },
          },
        ],
      }).compile();

      const svc = module.get<ENCFGeneratorService>(ENCFGeneratorService);
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(await svc.generateNext(1, 32));
      }

      expect(results).toEqual([
        'E320000000001',
        'E320000000002',
        'E320000000003',
        'E320000000004',
        'E320000000005',
      ]);
      expect(new Set(results).size).toBe(5); // todos únicos
    });
  });
});

// ── Test de concurrencia real con SELECT FOR UPDATE (requiere BD) ─────────────
// Solo corre si DB_HOST está configurado; se salta en CI sin DB.

const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ENCFGeneratorService — concurrencia con BD real', () => {
  let service: ENCFGeneratorService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const { DataSource: DS } = await import('typeorm');
    dataSource = new DS({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
      entities: [SecuenciaECF, TipoECF],
    });
    await dataSource.initialize();

    const module = await Test.createTestingModule({
      providers: [
        ENCFGeneratorService,
        { provide: getRepositoryToken(SecuenciaECF), useValue: dataSource.getRepository(SecuenciaECF) },
        { provide: getRepositoryToken(TipoECF),      useValue: dataSource.getRepository(TipoECF) },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<ENCFGeneratorService>(ENCFGeneratorService);
  });

  afterAll(async () => {
    await dataSource?.query('DELETE FROM secuencias_ecf WHERE "empresaId" = 9999');
    await dataSource?.destroy();
  });

  it('100 llamadas paralelas generan 100 números únicos (SELECT FOR UPDATE)', async () => {
    // Crear secuencia de prueba
    const tipo = await dataSource.query("SELECT id FROM tipos_ecf WHERE codigo = 'E32' LIMIT 1");
    const tipoId = tipo[0]?.id ?? 2;

    await dataSource.query(`
      INSERT INTO secuencias_ecf
        ("empresaId","tipoECFId","secuenciaInicial","secuenciaFinal","secuenciaActual",
         "fechaVencimiento","isAgotada","isActiva","alertaEnviada","userId","isActive","createdAt","updatedAt")
      VALUES (9999, ${tipoId}, 1, 200, 1, '2027-12-31', false, true, false, 1, true, NOW(), NOW())
    `);

    // 100 llamadas en paralelo
    const promises = Array.from({ length: 100 }, () => service.generateNext(9999, 32));
    const results  = await Promise.all(promises);

    const unicos = new Set(results);
    expect(unicos.size).toBe(100); // sin duplicados
    expect(results.every(r => /^E32\d{10}$/.test(r))).toBe(true); // formato correcto

    // Verificar que el contador quedó en 101
    const [sec] = await dataSource.query(
      'SELECT "secuenciaActual" FROM secuencias_ecf WHERE "empresaId" = 9999',
    );
    expect(Number(sec.secuenciaActual)).toBe(101);
  }, 30_000);
});
