import { MensajesService } from './mensajes.service';

/**
 * getNoLeidosCount() devolvía un único número global, sin filtrar por
 * m.tipo (a diferencia de getBandeja() y marcarTodosLeidos(), que sí lo
 * hacen) — y BandejaPage.tsx lo pintaba pegado a la pestaña "Principal".
 * Resultado: una novedad sin leer subía el badge de "Principal" aunque el
 * mensaje en realidad estuviera en "Novedades" (que nunca tuvo badge
 * propio). Ahora la query desglosa por tipo en una sola pasada con
 * COUNT(*) FILTER (WHERE ...), y el método devuelve
 * { principal, novedades, total }.
 */
describe('MensajesService.getNoLeidosCount — desglose por tipo', () => {
  const crearService = (fila: Record<string, unknown>) => {
    const query = jest.fn().mockResolvedValue([fila]);
    const svc: any = Object.create(MensajesService.prototype);
    svc.ds = { query };
    svc.tenantService = { getEmpresaId: () => 7 };
    return { svc, query };
  };

  it('devuelve el desglose tal cual lo entrega la base', async () => {
    const { svc } = crearService({ principal: 2, novedades: 1, total: 3 });
    await expect(svc.getNoLeidosCount(42)).resolves.toEqual({ principal: 2, novedades: 1, total: 3 });
  });

  it('sin ningún mensaje no leído, los tres quedan en 0 (no null/undefined)', async () => {
    const { svc } = crearService({ principal: null, novedades: null, total: null });
    await expect(svc.getNoLeidosCount(42)).resolves.toEqual({ principal: 0, novedades: 0, total: 0 });
  });

  it('el desglose es consistente: principal + novedades = total (mensajes solo tienen un tipo)', async () => {
    const { svc } = crearService({ principal: 5, novedades: 3, total: 8 });
    const r = await svc.getNoLeidosCount(42);
    expect(r.principal + r.novedades).toBe(r.total);
  });

  it('la query cuenta cada tipo con FILTER, no un solo COUNT(*) sin distinguir tipo', async () => {
    const { svc, query } = crearService({ principal: 0, novedades: 0, total: 0 });
    await svc.getNoLeidosCount(42);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/COUNT\(\*\)\s*FILTER\s*\(WHERE m\.tipo = 'aviso'\)/);
    expect(sql).toMatch(/COUNT\(\*\)\s*FILTER\s*\(WHERE m\.tipo = 'novedad'\)/);
  });

  it('sigue excluyendo leídos, archivados y eliminados — mismo filtro que antes', async () => {
    const { svc, query } = crearService({ principal: 0, novedades: 0, total: 0 });
    await svc.getNoLeidosCount(42);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('ml."leidoEn"     IS NULL');
    expect(sql).toContain('ml."archivadoEn" IS NULL');
    expect(sql).toContain('ml."eliminadoEn" IS NULL');
  });

  it('pasa el usuarioId y el empresaId del tenant como parámetros', async () => {
    const { svc, query } = crearService({ principal: 0, novedades: 0, total: 0 });
    await svc.getNoLeidosCount(42);

    expect(query.mock.calls[0][1]).toEqual([42, 7]);
  });
});
