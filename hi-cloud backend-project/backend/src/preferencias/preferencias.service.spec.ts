import { PreferenciasService } from './preferencias.service';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CATALOGO_WIDGETS,
  CLAVE_DASHBOARD_WIDGETS,
  MAX_WIDGETS,
  WIDGETS_POR_DEFECTO,
} from './dashboard-widgets.catalogo';

/**
 * La seleccion de graficas del dashboard se guarda por (usuario, empresa).
 *
 * Por usuario porque dos personas de la misma ferreteria miran cosas distintas;
 * y con la empresa dentro porque un contador que lleva varias no quiere las
 * mismas en todas.
 */
describe('PreferenciasService — widgets del dashboard', () => {
  const USER    = 94;
  const EMPRESA = 61;

  const crear = (fila: any = null, rol: UserRole = UserRole.ADMIN) => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(fila),
      upsert:  jest.fn().mockResolvedValue({}),
    };
    const svc: any = Object.create(PreferenciasService.prototype);
    svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    svc.repo   = repo;
    svc.tenantService = {
      getUserId:     () => USER,
      getEmpresaId:  () => EMPRESA,
      getRolEmpresa: () => rol,
    };
    return { svc, repo };
  };

  beforeEach(() => jest.clearAllMocks());

  // ── Lectura ───────────────────────────────────────────────────────────────

  it('quien nunca ha elegido recibe las cuatro de siempre', async () => {
    const { svc } = crear(null);
    const r = await svc.getWidgetsDashboard();

    expect(r.widgets).toEqual([...WIDGETS_POR_DEFECTO]);
    expect(r.porDefecto).toBe(true);
  });

  it('distingue "no he elegido" de "las quite todas"', async () => {
    // Una lista vacia guardada es una decision, no un usuario nuevo. Si el
    // frontend no puede distinguirlas, al que las quito todas le reaparecen.
    const { svc } = crear({ valor: [] });
    const r = await svc.getWidgetsDashboard();

    expect(r.widgets).toEqual([]);
    expect(r.porDefecto).toBe(false);
  });

  it('devuelve lo guardado respetando el orden', async () => {
    const guardado = ['top-clientes', 'ecf-estado-mes', 'horas-pico'];
    const { svc } = crear({ valor: guardado });

    expect((await svc.getWidgetsDashboard()).widgets).toEqual(guardado);
  });

  it('busca por usuario Y empresa, no solo por usuario', async () => {
    const { svc, repo } = crear(null);
    await svc.getWidgetsDashboard();

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { userId: USER, empresaId: EMPRESA, clave: CLAVE_DASHBOARD_WIDGETS, isActive: true },
    });
  });

  it('ignora al leer las graficas que ya no existen en el catalogo', async () => {
    // Retirar una grafica no puede obligar a migrar lo que la gente tenga
    // guardado, ni dejarle el panel roto.
    const { svc } = crear({ valor: ['top-clientes', 'grafica-que-se-retiro', 'horas-pico'] });

    expect((await svc.getWidgetsDashboard()).widgets).toEqual(['top-clientes', 'horas-pico']);
  });

  it('ignora al leer lo que no puede ver ese rol', async () => {
    const { svc } = crear(
      { valor: ['ventas-por-vendedor', 'resumen-gastos'] },
      UserRole.VIEWER,
    );
    // resumen-gastos vive en /reportes, que no admite viewer.
    expect((await svc.getWidgetsDashboard()).widgets).toEqual(['ventas-por-vendedor']);
  });

  it('un viewer no entra a un panel vacio', async () => {
    // Las cuatro por defecto viven en /reportes, que no admite viewer. Sin
    // respaldo, su primera visita seria una pantalla en blanco con el mensaje
    // de "las quitaste todas", que ademas es falso.
    const { svc } = crear(null, UserRole.VIEWER);
    const r = await svc.getWidgetsDashboard();

    expect(r.widgets.length).toBeGreaterThan(0);
    expect(r.porDefecto).toBe(true);
    // Y todas tienen que ser cosas que de verdad pueda pedir.
    for (const s of r.widgets) expect(r.catalogo.map((w: any) => w.slug)).toContain(s);
  });

  it('el catalogo llega filtrado por rol', async () => {
    const { svc: admin }  = crear(null, UserRole.ADMIN);
    const { svc: viewer } = crear(null, UserRole.VIEWER);

    const slugsViewer = (await viewer.getWidgetsDashboard()).catalogo.map((w: any) => w.slug);
    const slugsAdmin  = (await admin.getWidgetsDashboard()).catalogo.map((w: any) => w.slug);

    expect(slugsAdmin.length).toBeGreaterThan(slugsViewer.length);
    // Un viewer que pudiera agregar una grafica de /reportes se llevaria un 403.
    expect(slugsViewer).not.toContain('resumen-gastos');
    expect(slugsViewer).toContain('ventas-por-vendedor');
  });

  // ── Escritura ─────────────────────────────────────────────────────────────

  it('guarda la seleccion contra (usuario, empresa, clave)', async () => {
    const { svc, repo } = crear(null);
    await svc.setWidgetsDashboard(['ecf-estado-mes', 'top-clientes']);

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER, empresaId: EMPRESA, clave: CLAVE_DASHBOARD_WIDGETS,
        valor: ['ecf-estado-mes', 'top-clientes'],
      }),
      expect.objectContaining({ conflictPaths: ['userId', 'empresaId', 'clave'] }),
    );
  });

  it('acepta la lista vacia', async () => {
    const { svc, repo } = crear(null);
    await expect(svc.setWidgetsDashboard([])).resolves.toEqual({ widgets: [] });
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('rechaza un slug que no existe, en vez de filtrarlo callando', async () => {
    // Si el front manda algo que el servidor no conoce, es un despliegue
    // descompasado: hay que verlo, no taparlo.
    const { svc, repo } = crear(null);
    await expect(svc.setWidgetsDashboard(['ecf-estado-mes', 'inventada']))
      .rejects.toThrow(/"inventada" no existe/);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('rechaza una grafica que ese rol no puede ver', async () => {
    const { svc } = crear(null, UserRole.VIEWER);
    await expect(svc.setWidgetsDashboard(['resumen-gastos']))
      .rejects.toThrow(/no está disponible para tu rol/);
  });

  it('rechaza lo que no es un array', async () => {
    const { svc } = crear(null);
    await expect(svc.setWidgetsDashboard('top-clientes' as any))
      .rejects.toThrow(/debe ser un array/);
  });

  it('rechaza pasarse del tope', async () => {
    const { svc } = crear(null);
    const demasiadas = Array.from({ length: MAX_WIDGETS + 1 }, () => 'top-clientes');
    await expect(svc.setWidgetsDashboard(demasiadas)).rejects.toThrow(/máximo/);
  });

  it('colapsa los repetidos sin fallar', async () => {
    const { svc } = crear(null);
    const r = await svc.setWidgetsDashboard(['top-clientes', 'top-clientes', 'horas-pico']);
    expect(r.widgets).toEqual(['top-clientes', 'horas-pico']);
  });

  it('sin usuario en contexto no se toca ninguna fila', async () => {
    const { svc, repo } = crear(null);
    svc.tenantService.getUserId = () => null;

    await expect(svc.setWidgetsDashboard(['top-clientes'])).rejects.toThrow(/usuario/i);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('catalogo de widgets', () => {
  it('los defaults existen en el catalogo', () => {
    const slugs = CATALOGO_WIDGETS.map(w => w.slug);
    for (const d of WIDGETS_POR_DEFECTO) expect(slugs).toContain(d);
  });

  it('no hay slugs repetidos', () => {
    const slugs = CATALOGO_WIDGETS.map(w => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('los defaults caben en el tope', () => {
    expect(WIDGETS_POR_DEFECTO.length).toBeLessThanOrEqual(MAX_WIDGETS);
  });
});
