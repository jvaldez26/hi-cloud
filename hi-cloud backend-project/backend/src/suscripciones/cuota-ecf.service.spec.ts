import { CuotaEcfService } from './cuota-ecf.service';

/**
 * `ds` falso que devuelve la suscripción pedida y cuenta lo que se le diga,
 * guardando el SQL y los parámetros para poder afirmar sobre ellos.
 */
function montar(opts: {
  plan?: string | null;
  diaCorte?: number;
  estado?: string;
  emitidos?: number;
}) {
  const consultas: { sql: string; params: any[] }[] = [];
  const ds: any = {
    query: async (sql: string, params: any[]) => {
      consultas.push({ sql, params });
      if (sql.includes('FROM suscripciones')) {
        return opts.plan === null
          ? []
          : [{ plan: opts.plan ?? 'plus', diaCorte: opts.diaCorte ?? 5, estado: opts.estado ?? 'activa' }];
      }
      return [{ n: opts.emitidos ?? 0 }];
    },
  };
  return { svc: new CuotaEcfService(ds), consultas };
}

const conteo = (c: { sql: string }[]) => c.find(x => x.sql.includes('FROM ecf'))!;

describe('qué se cuenta', () => {
  it('cuenta toda fila de ecf del ciclo: un rechazado quemó secuencia igual', async () => {
    const { svc, consultas } = montar({ emitidos: 10 });
    const u = await svc.usoDelCiclo(44);
    // Si algún día alguien filtra por estado, los rechazados dejan de contar y
    // el cliente deja de pagar cuota que sí consumió.
    expect(conteo(consultas).sql).not.toMatch(/estadoDGII/);
    expect(u.emitidos).toBe(10);
  });

  it('descarta los emitidos en TEST y CERTIFICACION, que no llegan a la DGII', async () => {
    const { svc, consultas } = montar({ emitidos: 10 });
    await svc.usoDelCiclo(44);
    expect(conteo(consultas).sql).toContain(`"modoEmision" = 'PRODUCCION'`);
  });

  it('el filtro de modo es una igualdad, no un OR con IS NULL', async () => {
    // Con `OR "modoEmision" IS NULL` el planificador no puede usar la columna
    // como clave y el conteo del peor ciclo se va a Seq Scan: 11,9 ms contra
    // 2,1. La columna es NOT NULL con default, así que el OR sobra.
    const { svc, consultas } = montar({ emitidos: 10 });
    await svc.usoDelCiclo(44);
    expect(conteo(consultas).sql).not.toMatch(/IS NULL/);
  });

  it('acota por el ciclo, con el fin EXCLUSIVO', async () => {
    const { svc, consultas } = montar({ emitidos: 10 });
    await svc.usoDelCiclo(44, { inicio: '2026-08-05', fin: '2026-09-05' });
    const q = conteo(consultas);
    expect(q.sql).toContain('>= $2');
    expect(q.sql).toContain('<  $3');
    expect(q.params).toEqual([44, '2026-08-05', '2026-09-05']);
  });

  it('no crea la suscripción ni dispara resets: solo lee', async () => {
    const { svc, consultas } = montar({ emitidos: 1 });
    await svc.usoDelCiclo(44);
    expect(consultas.every(c => /^\s*SELECT/i.test(c.sql.trim()))).toBe(true);
  });
});

describe('umbrales', () => {
  const uso = (emitidos: number, plan = 'plus') =>
    montar({ plan, emitidos }).svc.usoDelCiclo(44, { inicio: '2026-08-05', fin: '2026-09-05' });

  it('por debajo del 80% no hay ni alerta ni exceso', async () => {
    const u = await uso(4_000);          // 4.000 de 6.000 = 67%
    expect(u).toMatchObject({ porcentaje: 67, alerta: false, excedida: false, excedente: 0 });
  });

  it('el 80% clavado ya avisa', async () => {
    const u = await uso(4_800);          // 4.800 de 6.000 = 80%
    expect(u).toMatchObject({ porcentaje: 80, alerta: true, excedida: false });
  });

  it('llegar al cupo exacto avisa pero NO es exceso: 6.000 incluidos son 6.000', async () => {
    const u = await uso(6_000);
    expect(u).toMatchObject({ porcentaje: 100, alerta: true, excedida: false, excedente: 0 });
  });

  it('el primero por encima del cupo ya es excedente', async () => {
    const u = await uso(6_001);
    expect(u).toMatchObject({ excedida: true, excedente: 1 });
  });

  it('el excedente es la diferencia, no el total', async () => {
    expect((await uso(6_412)).excedente).toBe(412);
  });

  it('cada plan tiene su cupo', async () => {
    expect((await uso(600, 'emprendedor')).excedente).toBe(100);
    expect((await uso(600, 'pyme')).excedente).toBe(0);
    expect((await uso(2_501, 'pro')).excedente).toBe(1);
  });
});

describe('casos de borde', () => {
  it('una empresa sin suscripción no tiene cupo y nunca sale como excedida', async () => {
    const { svc } = montar({ plan: null, emitidos: 99_999 });
    const u = await svc.usoDelCiclo(44);
    expect(u).toMatchObject({ ilimitado: true, excedida: false, excedente: 0, plan: null });
  });

  it('el ciclo sale del diaCorte de la empresa, no del mes calendario', async () => {
    const { svc } = montar({ diaCorte: 22, emitidos: 1 });
    const u = await svc.usoDelCiclo(44);
    expect(u.ciclo.inicio.slice(-2)).toBe('22');
    expect(u.ciclo.fin.slice(-2)).toBe('22');
  });

  it('el ciclo en curso no está cerrado: todavía puede sumar e-CF', async () => {
    const { svc } = montar({ emitidos: 1 });
    expect((await svc.usoDelCiclo(44)).cicloCerrado).toBe(false);
  });
});

describe('revisarTrasEmision — nunca bloquea', () => {
  it('no lanza aunque la empresa esté pasadísima', async () => {
    const { svc } = montar({ emitidos: 99_999 });
    await expect(svc.revisarTrasEmision(44)).resolves.toBeUndefined();
  });

  it('sale sin consultar nada si el plan no tiene tope', async () => {
    const { svc } = montar({ plan: null, emitidos: 10 });
    await expect(svc.revisarTrasEmision(44)).resolves.toBeUndefined();
  });
});
