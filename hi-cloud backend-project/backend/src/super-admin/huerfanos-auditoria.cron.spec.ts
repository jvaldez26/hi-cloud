import * as Sentry from '@sentry/node';
import { HuerfanosAuditoriaCron } from './huerfanos-auditoria.cron';

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

function buildDs(opts: {
  tablas: string[];
  conteos: Record<string, number>;
  tablaConError?: string;
}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('information_schema.columns')) {
      return opts.tablas.map(table_name => ({ table_name }));
    }
    const tabla = opts.tablas.find(t => sql.includes(`"${t}"`));
    if (tabla && tabla === opts.tablaConError) throw new Error(`relación "${tabla}" rota`);
    return [{ n: opts.conteos[tabla ?? ''] ?? 0 }];
  });
  return { query } as any;
}

describe('HuerfanosAuditoriaCron', () => {
  beforeEach(() => jest.clearAllMocks());

  it('usa information_schema para descubrir las tablas — nunca una lista fija', async () => {
    const ds = buildDs({ tablas: ['clientes', 'productos'], conteos: {} });
    const cron = new HuerfanosAuditoriaCron(ds);
    await cron.buscarHuerfanos();

    expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('information_schema.columns'));
  });

  it('reporta a Sentry (warning) solo las tablas con filas huérfanas, con tabla y cantidad', async () => {
    const ds = buildDs({
      tablas: ['clientes', 'productos', 'facturas'],
      conteos: { clientes: 3, productos: 0, facturas: 7 },
    });
    const cron = new HuerfanosAuditoriaCron(ds);
    await cron.auditar();

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('Huérfanos'),
      expect.objectContaining({
        level: 'warning',
        tags:  expect.objectContaining({ tabla: 'clientes' }),
        extra: expect.objectContaining({ tabla: 'clientes', filas: 3 }),
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ extra: expect.objectContaining({ tabla: 'facturas', filas: 7 }) }),
    );
  });

  it('sin huérfanos en ninguna tabla: no llama a Sentry', async () => {
    const ds = buildDs({ tablas: ['clientes', 'productos'], conteos: { clientes: 0, productos: 0 } });
    const cron = new HuerfanosAuditoriaCron(ds);
    await cron.auditar();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('una tabla que falla al consultarse no aborta la auditoría de las demás', async () => {
    const ds = buildDs({
      tablas: ['rota', 'clientes'],
      conteos: { clientes: 2 },
      tablaConError: 'rota',
    });
    const cron = new HuerfanosAuditoriaCron(ds);
    const hallazgos = await cron.buscarHuerfanos();

    expect(hallazgos).toEqual([{ tabla: 'clientes', filas: 2 }]);
  });
});
