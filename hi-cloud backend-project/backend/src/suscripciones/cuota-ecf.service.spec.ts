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
  precio?: number;
  /** Marcas ya puestas en ecf_consumo_ciclo: simula un aviso ya mandado. */
  aviso80Puesto?: boolean;
  aviso100Puesto?: boolean;
  /** El envío del correo revienta. */
  emailRoto?: boolean;
}) {
  const consultas: { sql: string; params: any[] }[] = [];
  const avisos: { umbral: number; d: any }[] = [];
  // Estado del UPDATE condicional, para que la segunda llamada no reclame.
  const puesto = { 80: !!opts.aviso80Puesto, 100: !!opts.aviso100Puesto };

  const ds: any = {
    query: async (sql: string, params: any[]) => {
      consultas.push({ sql, params });
      if (sql.includes('FROM suscripciones')) {
        return opts.plan === null
          ? []
          : [{ plan: opts.plan ?? 'plus', diaCorte: opts.diaCorte ?? 5, estado: opts.estado ?? 'activa' }];
      }
      if (sql.includes('FROM configuracion_cobros')) return [{ p: String(opts.precio ?? 0) }];
      if (sql.includes('INSERT INTO ecf_consumo_ciclo')) return [];
      if (sql.includes('UPDATE ecf_consumo_ciclo')) {
        // La reclamación es un SELECT sobre un CTE, así que devuelve el CONTEO
        // de filas actualizadas. El mock anterior devolvía `[{id:1}]` / `[]`,
        // imitando un `UPDATE ... RETURNING` — y eso fue justo lo que dejó pasar
        // el bug: `ds.query` no garantiza un array de filas fuera de un SELECT,
        // así que en producción `filas.length > 0` era siempre true y cada
        // comprobante emitido mandaba otra tanda de correos.
        const umbral = sql.includes('aviso100EnviadoEn" = now()') ? 100 : 80;
        if (puesto[umbral]) return [{ n: 0 }];   // ya reclamado
        puesto[umbral] = true;
        if (umbral === 100) puesto[80] = true;   // el de 100 da por servido el de 80
        return [{ n: 1 }];
      }
      return [{ n: opts.emitidos ?? 0 }];
    },
  };

  const notificaciones: any = {
    notificarCuotaEcf: async (_e: number, umbral: number, d: any) => {
      if (opts.emailRoto) throw new Error('SMTP caído');
      avisos.push({ umbral, d });
    },
  };

  return { svc: new CuotaEcfService(ds, notificaciones), consultas, avisos };
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

  it('si el correo revienta, la revisión termina en silencio', async () => {
    const { svc } = montar({ emitidos: 5_000, emailRoto: true });
    await expect(svc.revisarTrasEmision(44)).resolves.toBeUndefined();
  });
});

describe('avisos — cuándo se manda y cuántas veces', () => {
  it('por debajo del 80% no avisa NI escribe la fila del ciclo', async () => {
    const { svc, avisos, consultas } = montar({ emitidos: 4_000 });   // 67%
    await svc.revisarTrasEmision(44);
    expect(avisos).toHaveLength(0);
    // El caso normal son dos SELECT: la fila del ciclo solo nace cuando hay
    // algo que recordar. Si esto se rompe, la empresa que emite 300 al día
    // hace 300 escrituras diarias para nada.
    expect(consultas.some(c => /INSERT|UPDATE/.test(c.sql))).toBe(false);
  });

  it('al 80% manda el aviso de 80', async () => {
    const { svc, avisos } = montar({ emitidos: 4_800 });
    await svc.revisarTrasEmision(44);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].umbral).toBe(80);
  });

  it('al pasarse manda el de excedida, con el excedente y el precio vigente', async () => {
    const { svc, avisos } = montar({ emitidos: 6_412, precio: 3 });
    await svc.revisarTrasEmision(44);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].umbral).toBe(100);
    expect(avisos[0].d).toMatchObject({ excedente: 412, cupo: 6000, precioExcedente: 3 });
  });

  it('DOS EMISIONES SEGUIDAS NO MANDAN DOS CORREOS', async () => {
    // Lo que pasaría sin la reclamación atómica: 300 emisiones al día en la
    // empresa 44 son 300 correos.
    const { svc, avisos } = montar({ emitidos: 4_800 });
    await svc.revisarTrasEmision(44);
    await svc.revisarTrasEmision(44);
    await svc.revisarTrasEmision(44);
    expect(avisos).toHaveLength(1);
  });

  it('la reclamación se resuelve con un SELECT, no con un UPDATE ... RETURNING pelado', async () => {
    // El bug que llegó a producción: `DataSource.query()` solo garantiza
    // devolver un array de filas para un SELECT. Con `UPDATE ... RETURNING`
    // devuelve la estructura cruda del driver, así que contar su longitud daba
    // siempre "reclamado" y cada comprobante emitido mandaba otra tanda de
    // correos — 16 en cuatro emisiones antes de detectarlo.
    //
    // Envolver el UPDATE en un CTE deja arriba un SELECT, cuyo contrato de
    // retorno sí es estable. Este test fija esa forma, no el comportamiento.
    const { svc, consultas } = montar({ emitidos: 4_800 });
    await svc.revisarTrasEmision(44);
    const claim = consultas.find(c => c.sql.includes('UPDATE ecf_consumo_ciclo'))!;
    expect(claim.sql.trim()).toMatch(/^WITH/i);
    expect(claim.sql).toMatch(/SELECT COUNT\(\*\)/i);
  });

  it('la reclamación es UNA sentencia: nunca se lee la marca para escribirla después', async () => {
    // Este es el invariante de verdad, y el único que un mock puede fijar. Con
    // un SELECT previo hay una ventana entre leer y marcar en la que dos cajas
    // ven la marca vacía y mandan las dos; con el UPDATE ... WHERE ... IS NULL
    // el candado lo pone PostgreSQL sobre la fila.
    const { svc, consultas } = montar({ emitidos: 4_800 });
    await svc.revisarTrasEmision(44);
    const lecturasDeMarca = consultas.filter(c =>
      /^\s*SELECT/i.test(c.sql.trim()) && c.sql.includes('ecf_consumo_ciclo'));
    expect(lecturasDeMarca).toHaveLength(0);
    expect(consultas.filter(c => c.sql.includes('UPDATE ecf_consumo_ciclo'))).toHaveLength(1);
  });

  it('dos emisiones SIMULTÁNEAS tampoco', async () => {
    const { svc, avisos } = montar({ emitidos: 6_100 });
    await Promise.all([
      svc.revisarTrasEmision(44), svc.revisarTrasEmision(44), svc.revisarTrasEmision(44),
    ]);
    expect(avisos).toHaveLength(1);
  });

  it('el de 80 no se manda después del de excedida', async () => {
    // Un ciclo que cruza los dos umbrales de golpe: "vas por el 80%" detrás de
    // "lo superaste" no tiene sentido.
    const { svc, avisos } = montar({ emitidos: 6_500 });
    await svc.revisarTrasEmision(44);       // manda el de 100 y da por servido el de 80
    expect(avisos.map(a => a.umbral)).toEqual([100]);
  });

  it('tras avisar al 80, pasarse manda además el de excedida', async () => {
    const { svc, avisos } = montar({ emitidos: 6_412, aviso80Puesto: true });
    await svc.revisarTrasEmision(44);
    expect(avisos.map(a => a.umbral)).toEqual([100]);
  });

  it('con el aviso ya marcado no se repite aunque siga emitiendo', async () => {
    const { svc, avisos } = montar({ emitidos: 6_412, aviso80Puesto: true, aviso100Puesto: true });
    await svc.revisarTrasEmision(44);
    expect(avisos).toHaveLength(0);
  });

  it('la marca se pone ANTES de enviar: un correo fallido no reabre la puerta', async () => {
    const { svc, consultas } = montar({ emitidos: 5_000, emailRoto: true });
    await svc.revisarTrasEmision(44);
    const iUpdate = consultas.findIndex(c => c.sql.includes('UPDATE ecf_consumo_ciclo'));
    const iPrecio = consultas.findIndex(c => c.sql.includes('configuracion_cobros'));
    expect(iUpdate).toBeGreaterThanOrEqual(0);
    expect(iUpdate).toBeLessThan(iPrecio);   // se marcó antes de armar el correo
  });

  it('el aviso lleva el ciclo real de la empresa, no el mes', async () => {
    const { svc, avisos } = montar({ emitidos: 4_800, diaCorte: 22 });
    await svc.revisarTrasEmision(44);
    expect(avisos[0].d.cicloInicio.slice(-2)).toBe('22');
    expect(avisos[0].d.cicloFin.slice(-2)).toBe('22');
  });
});

describe('configuración del precio', () => {
  /** ds falso con estado, para poder leer lo que se escribió. */
  function montarConfig(precioInicial = 0) {
    const estado = { precio: precioInicial, por: null as number | null, updatedAt: new Date() };
    const consultas: string[] = [];
    const ds: any = {
      query: async (sql: string, params: any[]) => {
        consultas.push(sql);
        if (sql.includes('INSERT INTO configuracion_cobros')) return [];
        if (sql.includes('UPDATE configuracion_cobros')) {
          estado.precio = Number(params[0]); estado.por = params[1]; return [];
        }
        if (sql.includes('FROM configuracion_cobros')) {
          return [{ precioEcfExcedente: String(estado.precio), actualizadoPor: estado.por, updatedAt: estado.updatedAt }];
        }
        return [];
      },
    };
    return { svc: new CuotaEcfService(ds, { notificarCuotaEcf: async () => {} } as any), consultas, estado };
  }

  it('devuelve el precio con su rastro de quién y cuándo', async () => {
    const { svc } = montarConfig(3);
    const cfg = await svc.getConfiguracionCobros();
    expect(cfg.precioEcfExcedente).toBe(3);
    expect(cfg).toHaveProperty('actualizadoPor');
    expect(cfg).toHaveProperty('updatedAt');
  });

  it('la fila se recrea si faltara: el panel no puede reventar por eso', async () => {
    const { svc, consultas } = montarConfig();
    await svc.getConfiguracionCobros();
    expect(consultas.some(s => s.includes('INSERT INTO configuracion_cobros'))).toBe(true);
    expect(consultas.find(s => s.includes('INSERT INTO configuracion_cobros'))).toContain('ON CONFLICT');
  });

  it('actualizar guarda el precio y quién lo tocó', async () => {
    const { svc, estado } = montarConfig(0);
    const cfg = await svc.actualizarPrecioExcedente(3.5, 7);
    expect(estado.precio).toBe(3.5);
    expect(estado.por).toBe(7);
    expect(cfg.precioEcfExcedente).toBe(3.5);
  });

  it('numeric de PostgreSQL llega como texto y se devuelve como número', async () => {
    // '3.50' + 412 sería '3.50412' en vez de 415.5. El bug clásico de numeric.
    const { svc } = montarConfig(3.5);
    expect(typeof (await svc.getConfiguracionCobros()).precioEcfExcedente).toBe('number');
    expect(typeof (await svc.precioExcedente())).toBe('number');
  });

  it('poner el precio a 0 vuelve a "sin configurar", no a gratis', async () => {
    const { svc } = montarConfig(3);
    await svc.actualizarPrecioExcedente(0, 7);
    expect((await svc.getConfiguracionCobros()).precioEcfExcedente).toBe(0);
  });
});

describe('precio del excedente', () => {
  it('0 significa sin configurar y viaja tal cual al aviso', async () => {
    const { svc, avisos } = montar({ emitidos: 6_412 });
    await svc.revisarTrasEmision(44);
    expect(avisos[0].d.precioExcedente).toBe(0);
  });

  it('se lee de configuracion_cobros en cada aviso, no se cachea', async () => {
    const { svc, consultas } = montar({ emitidos: 6_412, precio: 4.5 });
    await svc.revisarTrasEmision(44);
    expect(consultas.filter(c => c.sql.includes('configuracion_cobros'))).toHaveLength(1);
    expect(await svc.precioExcedente()).toBe(4.5);
  });
});
