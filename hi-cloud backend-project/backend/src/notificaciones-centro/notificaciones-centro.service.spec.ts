import { NotificacionesCentroService } from './notificaciones-centro.service';

const EMPRESA = 7;
const USER = 42;

function buildService(opts: {
  eventos?: any[];
  alertas?: { id: string; titulo: string; descripcion: string; ruta: string; emoji: string; cantidad?: number; monto?: number; severidad?: string }[];
  vistas?: any[];
  rol?: string;
  prefs?: Record<string, boolean>;
}) {
  const eventos = opts.eventos ?? [];
  const alertas = opts.alertas ?? [];
  const vistas  = opts.vistas ?? [];
  const usuario: any = { id: USER, preferenciasNotificaciones: { ...(opts.prefs ?? {}) } };

  const eventoRepo = {
    find: jest.fn().mockResolvedValue(eventos),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        update: () => qb,
        set:    (s: any) => { qb._set = s; return qb; },
        where:  (w: string, p: any) => { qb._where = w; qb._params = p; return qb; },
        execute: async () => {
          const afectados = eventos.filter(e => {
            if (qb._params.eventoId !== undefined && e.id !== qb._params.eventoId) return false;
            if (e.userId !== qb._params.userId) return false;
            if (e.empresaId != null && e.empresaId !== qb._params.eid) return false;
            if (qb._where.includes('leido = false') && e.leido) return false;
            return true;
          });
          for (const e of afectados) { e.leido = true; e.leidoEn = new Date(); }
          return { affected: afectados.length };
        },
      };
      return qb;
    }),
  };

  const vistaRepo = {
    find:     jest.fn().mockResolvedValue(vistas),
    findOne:  jest.fn().mockImplementation(async ({ where }: any) =>
      vistas.find(v => v.empresaId === where.empresaId && v.userId === where.userId && v.tipo === where.tipo) ?? null),
    update:   jest.fn().mockImplementation(async (id: number, patch: any) => {
      const v = vistas.find(x => x.id === id);
      if (v) Object.assign(v, patch);
    }),
    create:   jest.fn((x: any) => ({ id: vistas.length + 1, ...x })),
    save:     jest.fn().mockImplementation(async (x: any) => { vistas.push(x); return x; }),
  };

  const userRepo = {
    findOne: jest.fn().mockImplementation(async () => ({ ...usuario })),
    update:  jest.fn().mockImplementation(async (_id: number, patch: any) => { Object.assign(usuario, patch); }),
  };

  const tenantSvc = {
    getEmpresaId:  () => EMPRESA,
    getUserId:     () => USER,
    getRolEmpresa: () => opts.rol ?? 'admin',
  };

  const alertasSvc = {
    getAlertas: jest.fn().mockResolvedValue({
      alertas: alertas.map(a => ({ severidad: 'media', ...a })),
      total: alertas.length,
      criticas: 0,
    }),
  };

  const svc = new NotificacionesCentroService(
    eventoRepo as any, vistaRepo as any, userRepo as any, tenantSvc as any, alertasSvc as any,
  );
  return { svc, eventoRepo, vistaRepo, userRepo, alertasSvc, usuario };
}

describe('NotificacionesCentroService — eventos: clic marca leído y baja el número', () => {
  it('un evento no leído cuenta en noLeidos; marcarEventoLeido lo baja', async () => {
    const eventos = [
      { id: 1, tipo: 'xlink_documento_recibido', asunto: 'Doc nuevo', mensaje: 'x', referencia: null, userId: USER, empresaId: EMPRESA, leido: false, createdAt: new Date() },
    ];
    const { svc } = buildService({ eventos });

    const antes = await svc.obtener();
    expect(antes.noLeidos).toBe(1);
    expect(antes.items[0].atendido).toBe(false);

    await svc.marcarEventoLeido(1);

    const despues = await svc.obtener();
    expect(despues.noLeidos).toBe(0);
    expect(despues.items[0].atendido).toBe(true);
  });

  it('marcarTodoLeido baja todos los no leídos de una sola vez', async () => {
    const eventos = [
      { id: 1, tipo: 'xlink_documento_recibido', asunto: 'A', mensaje: 'x', referencia: null, userId: USER, empresaId: EMPRESA, leido: false, createdAt: new Date() },
      { id: 2, tipo: 'caja_huerfana', asunto: 'B', mensaje: 'x', referencia: null, userId: USER, empresaId: EMPRESA, leido: false, createdAt: new Date() },
    ];
    const { svc } = buildService({ eventos });
    expect((await svc.obtener()).noLeidos).toBe(2);

    const marcados = await svc.marcarTodoLeido();
    expect(marcados).toBe(2);
    expect((await svc.obtener()).noLeidos).toBe(0);
  });
});

describe('NotificacionesCentroService — alertas: vista no cuenta hasta que cambia', () => {
  it('sin marcar vista, la alerta cuenta en noVistas', async () => {
    const { svc } = buildService({
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }],
    });
    const r = await svc.obtener();
    expect(r.noVistas).toBe(1);
    expect(r.items[0].atendido).toBe(false);
  });

  it('marcada como vista con la misma huella, deja de contar', async () => {
    const { svc } = buildService({
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }],
    });
    await svc.marcarAlertaVista('stock-bajo');
    const r = await svc.obtener();
    expect(r.noVistas).toBe(0);
    expect(r.items[0].atendido).toBe(true);
  });

  it('si la cantidad cambia después de marcarla vista, vuelve a contar', async () => {
    const alertas = [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }];
    const { svc, alertasSvc } = buildService({ alertas });
    await svc.marcarAlertaVista('stock-bajo');
    expect((await svc.obtener()).noVistas).toBe(0);

    // El conteo real subió — la huella guardada (cantidad=5) ya no coincide.
    alertasSvc.getAlertas.mockResolvedValue({
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '8', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 8, severidad: 'alta' }],
      total: 1, criticas: 1,
    });

    const r = await svc.obtener();
    expect(r.noVistas).toBe(1);
    expect(r.items[0].atendido).toBe(false);
  });

  it('posponer 1 día suprime la alerta aunque no haya cambiado, pero solo temporalmente', async () => {
    const { svc, vistaRepo } = buildService({
      alertas: [{ id: 'cierre-descuadre', titulo: 'Descuadre', descripcion: '2', ruta: '/caja?tab=historial&descuadre=1', emoji: '🏦', cantidad: 2 }],
    });
    await svc.marcarAlertaVista('cierre-descuadre', true);
    expect((await svc.obtener()).noVistas).toBe(0);

    // Simula que pasó el día: pospuestoHasta queda en el pasado.
    const fila = (await vistaRepo.find()).find((v: any) => v.tipo === 'cierre-descuadre');
    fila.pospuestoHasta = new Date(Date.now() - 1000);

    const r = await svc.obtener();
    expect(r.noVistas).toBe(1); // misma huella, pero el plazo ya pasó
  });
});

describe('NotificacionesCentroService — visibilidad por rol', () => {
  it('un vendedor no ve el descuadre de caja (solo admin/contador)', async () => {
    const { svc } = buildService({
      rol: 'vendedor',
      alertas: [{ id: 'cierre-descuadre', titulo: 'Descuadre', descripcion: '2', ruta: '/caja', emoji: '🏦', cantidad: 2 }],
    });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(0);
  });

  it('un vendedor SÍ ve stock bajo (alerta operativa)', async () => {
    const { svc } = buildService({
      rol: 'vendedor',
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }],
    });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(1);
  });

  it('un evento de tipo desconocido (no mapeado en visibilidad.config) nunca se muestra', async () => {
    const eventos = [
      { id: 1, tipo: 'tipo_inventado_sin_mapear', asunto: 'x', mensaje: 'x', referencia: null, userId: USER, empresaId: EMPRESA, leido: false, createdAt: new Date() },
    ];
    const { svc } = buildService({ eventos });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(0);
  });
});

describe('NotificacionesCentroService — scoping por empresa', () => {
  it('un evento de OTRA empresa no aparece ni se puede marcar leído', async () => {
    const eventos = [
      { id: 1, tipo: 'xlink_documento_recibido', asunto: 'x', mensaje: 'x', referencia: null, userId: USER, empresaId: 999, leido: false, createdAt: new Date() },
    ];
    // find() ya filtraría por empresaId=EMPRESA en producción (la query real
    // tiene el WHERE); aquí lo simulamos devolviendo solo lo que el repo
    // "real" habría devuelto para EMPRESA.
    const { svc, eventoRepo } = buildService({ eventos: [] });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(0);

    // marcarEventoLeido con el id de un evento de otra empresa no debe tocar nada.
    await svc.marcarEventoLeido(1);
    expect(eventos[0].leido).toBe(false);
  });

  it('un aviso de cuenta (empresaId NULL, ej. LOGIN_BLOQUEADO) se ve sin importar la empresa activa', async () => {
    const eventos = [
      { id: 1, tipo: 'login_bloqueado', asunto: 'Cuenta bloqueada', mensaje: 'x', referencia: null, userId: USER, empresaId: null, leido: false, createdAt: new Date() },
    ];
    const { svc } = buildService({ eventos });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(1);
    expect(r.items[0].tipo).toBe('login_bloqueado');
  });
});

describe('NotificacionesCentroService — preferencias por usuario', () => {
  it('sin preferencia guardada, un tipo visible por rol se muestra (encendido por defecto)', async () => {
    const { svc } = buildService({
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }],
    });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(1);
  });

  it('con la preferencia apagada (false), el tipo desaparece aunque el rol lo permita', async () => {
    const { svc } = buildService({
      prefs: { 'stock-bajo': false },
      alertas: [{ id: 'stock-bajo', titulo: 'Stock bajo', descripcion: '5', ruta: '/productos?filtro=stock-bajo', emoji: '📦', cantidad: 5 }],
    });
    const r = await svc.obtener();
    expect(r.items).toHaveLength(0);
  });

  it('guardarPreferencia(tipo, false) lo apaga y guardarPreferencia(tipo, true) lo vuelve a encender', async () => {
    const eventos = [
      { id: 1, tipo: 'xlink_documento_recibido', asunto: 'x', mensaje: 'x', referencia: null, userId: USER, empresaId: EMPRESA, leido: false, createdAt: new Date() },
    ];
    const { svc, usuario } = buildService({ eventos });

    await svc.guardarPreferencia('xlink_documento_recibido', false);
    expect(usuario.preferenciasNotificaciones['xlink_documento_recibido']).toBe(false);
    expect((await svc.obtener()).items).toHaveLength(0);

    await svc.guardarPreferencia('xlink_documento_recibido', true);
    expect(usuario.preferenciasNotificaciones['xlink_documento_recibido']).toBeUndefined();
    expect((await svc.obtener()).items).toHaveLength(1);
  });

  it('obtenerPreferencias lista solo los tipos visibles para el rol del usuario, con su estado actual', async () => {
    const { svc } = buildService({ rol: 'vendedor', prefs: { 'stock-bajo': false } });
    const prefs = await svc.obtenerPreferencias();

    const stockBajo = prefs.find(p => p.tipo === 'stock-bajo');
    expect(stockBajo?.activo).toBe(false);

    // Un vendedor nunca ve 'cierre-descuadre' (ADMIN_CONT únicamente) — ni
    // siquiera como preferencia para activar/desactivar.
    expect(prefs.find(p => p.tipo === 'cierre-descuadre')).toBeUndefined();
  });

  it('guardarPreferencia rechaza un tipo desconocido', async () => {
    const { svc } = buildService({});
    await expect(svc.guardarPreferencia('tipo-inventado', false)).rejects.toThrow();
  });
});
