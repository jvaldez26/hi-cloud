/**
 * Etapa 3 — Cobranza. Mismo patrón que mora.cron.spec.ts / e2e-flujo-completo.spec.ts:
 * un DataSource simulado que responde a las queries EXACTAS que hace
 * CobranzaService (dispatcher sobre arrays en memoria, no un parser SQL),
 * para probar que el service real — tal cual está — encadena bien un flujo
 * completo: registrar gestión → promesa de pago → verla incumplida en la
 * cartera → el cobrador hace seguimiento → la bandera se apaga → reasignar
 * cartera → filtrar "mi cartera" → notificar por email/WhatsApp.
 */
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CobranzaService } from './cobranza.service';

interface Prestamo {
  id: number; empresaId: number; numero: string; deudorId: number;
  saldoCapital: number; saldoMora: number; saldoTotal: number;
  diasMoraActual: number; cuotasVencidas: number; estado: string;
  cobradorId: number | null; cobradorNombre: string | null;
  oficialId: number | null; oficialNombre: string | null;
}
interface Gestion {
  id: number; empresaId: number; prestamoId: number; deudorId: number;
  cobradorId: number | null; cobradorNombre: string | null;
  fecha: string; tipo: string | null; resultado: string | null;
  montoPrometido: number | null; fechaPromesaPago: string | null;
  descripcion: string; diasMoraAlMomento: number; saldoAlMomento: number;
  proximaGestion: string | null;
}

function buildDs() {
  const hoy = new Date();
  const fmtFecha = (d: Date) => d.toISOString().slice(0, 10);
  const ayer = fmtFecha(new Date(hoy.getTime() - 86400_000));
  const manana = fmtFecha(new Date(hoy.getTime() + 86400_000));

  const prestamos: Prestamo[] = [{
    id: 100, empresaId: 1, numero: 'PR-0001', deudorId: 10,
    saldoCapital: 5000, saldoMora: 300, saldoTotal: 5300,
    diasMoraActual: 20, cuotasVencidas: 2, estado: 'moroso',
    cobradorId: null, cobradorNombre: null, oficialId: null, oficialNombre: null,
  }];
  const deudores = [{ id: 10, empresaId: 1, nombre: 'Deudor Test', cedula: '001-0000000-1', telefono: '8091112222', direccion: 'Calle Falsa 123', email: 'deudor@test.com' }];
  const empresas = [{ id: 1, nombreComercial: 'Financiera Test', nombre: 'Financiera Test SRL', email: 'contacto@financiera.test', telefono: '8095551234' }];
  const users = [{ id: 7, nombre: 'Ana Cobradora', email: 'ana@financiera.test', isActive: true }];
  const usuarioEmpresa = [{ userId: 7, empresaId: 1, isActive: true }];
  let gestiones: Gestion[] = [];
  let secuenciaGestion = 0;

  const escalamiento = (dias: number) =>
    dias >= 60 ? 'legal' : dias >= 30 ? 'carta' : dias >= 15 ? 'telefonica' : dias >= 5 ? 'recordatorio' : 'sin_accion';

  // En Postgres "fecha" es TIMESTAMP (default NOW()), nunca hay dos gestiones
  // con el mismo instante exacto — el id como segundo criterio de orden
  // replica esa garantía sin depender de precisión de reloj en el test.
  const ultimaGestionDe = (prestamoId: number) =>
    gestiones.filter(g => g.prestamoId === prestamoId).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)[0];

  const diasEntre = (desde: string) => Math.max(0, Math.round((hoy.getTime() - new Date(desde).getTime()) / 86400_000));

  const query = jest.fn(async (sql: string, params: any[] = []): Promise<any[]> => {
    // ── asignarCobrador: lookup del usuario ──────────────────────────────
    if (sql.includes('SELECT nombre FROM users')) {
      const [userId, empresaId] = params;
      const u = users.find(x => x.id === userId);
      const ue = usuarioEmpresa.find(x => x.userId === userId && x.empresaId === empresaId && x.isActive);
      return (u && ue) ? [{ nombre: u.nombre }] : [];
    }
    // ── listarCobradores ──────────────────────────────────────────────────
    if (sql.includes('SELECT u.id, u.nombre, u.email')) {
      const [empresaId] = params;
      return usuarioEmpresa
        .filter(ue => ue.empresaId === empresaId && ue.isActive)
        .map(ue => users.find(u => u.id === ue.userId)!)
        .filter(u => u.isActive)
        .map(u => ({ id: u.id, nombre: u.nombre, email: u.email }));
    }
    // ── asignarCobrador: UPDATE ───────────────────────────────────────────
    if (sql.includes('UPDATE pr_prestamos SET "cobradorId"')) {
      const [cobradorId, cobradorNombre, prestamoId, empresaId] = params;
      const p = prestamos.find(x => x.id === prestamoId && x.empresaId === empresaId);
      if (!p) return [];
      p.cobradorId = cobradorId; p.cobradorNombre = cobradorNombre;
      return [{ id: p.id, cobradorId: p.cobradorId, cobradorNombre: p.cobradorNombre }];
    }
    // ── registrarGestion: SELECT préstamo ─────────────────────────────────
    if (sql.includes('SELECT p.*, d.nombre AS "deudorNombre"') && sql.includes('FROM pr_prestamos p JOIN pr_deudores d')) {
      const [prestamoId, empresaId] = params;
      const p = prestamos.find(x => x.id === prestamoId && x.empresaId === empresaId);
      return p ? [{ ...p, deudorNombre: deudores.find(d => d.id === p.deudorId)?.nombre }] : [];
    }
    // ── registrarGestion: INSERT ───────────────────────────────────────────
    if (sql.includes('INSERT INTO pr_cobranzas')) {
      const [empresaId, prestamoId, deudorId, cobradorId, cobradorNombre, tipo, resultado,
        montoPrometido, fechaPromesaPago, descripcion, diasMoraAlMomento, saldoAlMomento, proximaGestion] = params;
      secuenciaGestion += 1;
      const g: Gestion = {
        id: secuenciaGestion, empresaId, prestamoId, deudorId, cobradorId, cobradorNombre,
        fecha: fmtFecha(new Date(hoy.getTime() + secuenciaGestion)), tipo, resultado, montoPrometido,
        fechaPromesaPago, descripcion, diasMoraAlMomento, saldoAlMomento, proximaGestion,
      };
      gestiones.push(g);
      return [g];
    }
    // ── gestionesByPrestamo ─────────────────────────────────────────────
    if (sql.includes('FROM pr_cobranzas c LEFT JOIN users u')) {
      const [prestamoId, empresaId] = params;
      return gestiones.filter(g => g.prestamoId === prestamoId && g.empresaId === empresaId);
    }
    // ── notificarMora: SELECT (tiene deudorEmail) ──────────────────────────
    if (sql.includes('"deudorEmail"') && sql.includes('JOIN empresa')) {
      const [prestamoId, empresaId] = params;
      const p = prestamos.find(x => x.id === prestamoId && x.empresaId === empresaId);
      if (!p) return [];
      const d = deudores.find(x => x.id === p.deudorId)!;
      const e = empresas.find(x => x.id === empresaId)!;
      return [{
        numero: p.numero, saldoMora: p.saldoMora, saldoTotal: p.saldoTotal,
        cuotasVencidas: p.cuotasVencidas, diasMoraActual: p.diasMoraActual,
        deudorNombre: d.nombre, deudorEmail: d.email,
        empresaComercial: e.nombreComercial, empresaNombre: e.nombre,
        empresaEmail: e.email, empresaTelefono: e.telefono,
      }];
    }
    // ── linkWhatsappMora: SELECT (tiene deudorTelefono, sin email) ─────────
    if (sql.includes('"deudorTelefono"') && sql.includes('JOIN empresa')) {
      const [prestamoId, empresaId] = params;
      const p = prestamos.find(x => x.id === prestamoId && x.empresaId === empresaId);
      if (!p) return [];
      const d = deudores.find(x => x.id === p.deudorId)!;
      const e = empresas.find(x => x.id === empresaId)!;
      return [{
        numero: p.numero, saldoMora: p.saldoMora, saldoTotal: p.saldoTotal,
        cuotasVencidas: p.cuotasVencidas, diasMoraActual: p.diasMoraActual,
        deudorNombre: d.nombre, deudorTelefono: d.telefono,
        empresaComercial: e.nombreComercial, empresaNombre: e.nombre,
      }];
    }
    // ── resumenCobranza: promesasIncumplidas ───────────────────────────────
    if (sql.includes('"promesasIncumplidas"')) {
      const [empresaId] = params;
      const total = prestamos.filter(p => {
        if (p.empresaId !== empresaId || !['moroso', 'vencido'].includes(p.estado)) return false;
        const ug = ultimaGestionDe(p.id);
        return !!ug && ug.resultado === 'promesa_pago' && !!ug.fechaPromesaPago && ug.fechaPromesaPago < fmtFecha(hoy);
      }).length;
      return [{ promesasIncumplidas: String(total) }];
    }
    // ── resumenCobranza: stats ──────────────────────────────────────────
    if (sql.includes('"indiceMorosidad"')) {
      const [empresaId] = params;
      const propios = prestamos.filter(p => p.empresaId === empresaId);
      return [{
        totalMorosos: String(propios.filter(p => p.estado === 'moroso').length),
        totalVencidos: String(propios.filter(p => p.estado === 'vencido').length),
        saldoMoraTotal: String(propios.filter(p => ['moroso', 'vencido'].includes(p.estado)).reduce((a, p) => a + p.saldoMora, 0)),
        carteraVencidaTotal: String(propios.filter(p => ['moroso', 'vencido'].includes(p.estado)).reduce((a, p) => a + p.saldoCapital, 0)),
        totalActivos: String(propios.filter(p => !['pagado', 'cancelado'].includes(p.estado)).length),
        totalEnMora: String(propios.filter(p => ['moroso', 'vencido'].includes(p.estado)).length),
        indiceMorosidad: '0',
      }];
    }
    // ── carteraVencida: COUNT(*) ────────────────────────────────────────
    if (sql.includes('SELECT COUNT(*) FROM pr_prestamos p')) {
      const [empresaId, cobradorId] = params;
      const filtrados = prestamos.filter(p => {
        if (p.empresaId !== empresaId || !['moroso', 'vencido'].includes(p.estado)) return false;
        if (sql.includes('COALESCE(p."cobradorId", p."oficialId") = $2')) {
          if ((p.cobradorId ?? p.oficialId) !== cobradorId) return false;
        }
        if (sql.includes(`AND ug.resultado = 'promesa_pago'`)) {
          const ug = ultimaGestionDe(p.id);
          if (!ug || ug.resultado !== 'promesa_pago' || !ug.fechaPromesaPago || ug.fechaPromesaPago >= fmtFecha(hoy)) return false;
        }
        return true;
      });
      return [{ count: String(filtrados.length) }];
    }
    // ── carteraVencida: SELECT principal ─────────────────────────────────
    if (sql.includes('"cobradorEfectivoId"')) {
      const [empresaId, cobradorId] = params;
      const filtrados = prestamos.filter(p => {
        if (p.empresaId !== empresaId || !['moroso', 'vencido'].includes(p.estado)) return false;
        if (sql.includes('COALESCE(p."cobradorId", p."oficialId") = $2')) {
          if ((p.cobradorId ?? p.oficialId) !== cobradorId) return false;
        }
        if (sql.includes(`AND ug.resultado = 'promesa_pago'`)) {
          const ug = ultimaGestionDe(p.id);
          if (!ug || ug.resultado !== 'promesa_pago' || !ug.fechaPromesaPago || ug.fechaPromesaPago >= fmtFecha(hoy)) return false;
        }
        return true;
      });
      return filtrados.map(p => {
        const d = deudores.find(x => x.id === p.deudorId)!;
        const ug = ultimaGestionDe(p.id);
        return {
          ...p,
          deudorNombre: d.nombre, deudorCedula: d.cedula, deudorTelefono: d.telefono,
          deudorDireccion: d.direccion, deudorEmail: d.email,
          cobradorEfectivoId: p.cobradorId ?? p.oficialId,
          cobradorEfectivoNombre: p.cobradorNombre ?? p.oficialNombre,
          ultimaGestion: ug?.fecha ?? null,
          diasUltimaGestion: ug ? diasEntre(ug.fecha) : null,
          promesaIncumplida: !!ug && ug.resultado === 'promesa_pago' && !!ug.fechaPromesaPago && ug.fechaPromesaPago < fmtFecha(hoy),
          nivelEscalamiento: escalamiento(p.diasMoraActual),
        };
      });
    }
    return [];
  });

  const emailService = { enviar: jest.fn().mockResolvedValue({ exitoso: true }) };
  const svc = new CobranzaService({ query } as any, emailService as any);
  return { svc, prestamos, gestiones: () => gestiones, emailService, ayer, manana, hoy: fmtFecha(hoy) };
}

const ANA = { id: 7, nombre: 'Ana Cobradora' };

describe('CobranzaService — flujo completo de cobranza (Etapa 3)', () => {
  it('un préstamo nuevo en mora aparece en la cartera sin gestión ni cobrador', async () => {
    const { svc } = buildDs();
    const { data } = await svc.carteraVencida(1, {});
    expect(data).toHaveLength(1);
    expect(data[0].diasUltimaGestion).toBeNull();
    expect(data[0].promesaIncumplida).toBe(false);
    expect(data[0].cobradorEfectivoId).toBeNull();
  });

  it('20 días de mora sugiere escalamiento "telefonica" (umbral 15/30/60)', async () => {
    const { svc } = buildDs();
    const { data } = await svc.carteraVencida(1, {});
    expect(data[0].nivelEscalamiento).toBe('telefonica');
  });

  it('registrar una gestión sin cobradorId la toma del usuario autenticado (antes quedaba NULL)', async () => {
    const { svc, gestiones } = buildDs();
    await svc.registrarGestion(1, { prestamoId: 100, descripcion: 'Llamada de seguimiento' }, ANA);
    expect(gestiones()[0].cobradorId).toBe(7);
    expect(gestiones()[0].cobradorNombre).toBe('Ana Cobradora');
  });

  it('una promesa de pago con fecha ya vencida se marca "promesaIncumplida" en la cartera', async () => {
    const { svc, ayer } = buildDs();
    await svc.registrarGestion(1, {
      prestamoId: 100, descripcion: 'Promete pagar', tipo: 'llamada',
      resultado: 'promesa_pago', fechaPromesaPago: ayer, montoPrometido: 300,
    }, ANA);

    const { data } = await svc.carteraVencida(1, {});
    expect(data[0].promesaIncumplida).toBe(true);
    expect(data[0].diasUltimaGestion).toBeGreaterThanOrEqual(0);
  });

  it('una promesa con fecha futura (todavía vigente) NO se marca incumplida', async () => {
    const { svc, manana } = buildDs();
    await svc.registrarGestion(1, {
      prestamoId: 100, descripcion: 'Promete pagar la próxima semana',
      resultado: 'promesa_pago', fechaPromesaPago: manana,
    }, ANA);
    const { data } = await svc.carteraVencida(1, {});
    expect(data[0].promesaIncumplida).toBe(false);
  });

  it('si el cobrador hace una gestión NUEVA después de la promesa vencida, la bandera se apaga sola', async () => {
    const { svc, ayer } = buildDs();
    await svc.registrarGestion(1, {
      prestamoId: 100, descripcion: 'Promete pagar', resultado: 'promesa_pago', fechaPromesaPago: ayer,
    }, ANA);
    await svc.registrarGestion(1, {
      prestamoId: 100, descripcion: 'Llamé de nuevo, pagó parcial', resultado: 'pago_parcial',
    }, ANA);

    const { data } = await svc.carteraVencida(1, {});
    expect(data[0].promesaIncumplida).toBe(false);
  });

  it('el filtro de "soloPromesasIncumplidas" excluye préstamos sin promesa vencida', async () => {
    const { svc } = buildDs();
    const { data } = await svc.carteraVencida(1, { soloPromesasIncumplidas: 'true' });
    expect(data).toHaveLength(0);
  });

  it('reasignar la cartera a un cobrador válido de la empresa persiste el nombre', async () => {
    const { svc, prestamos } = buildDs();
    const r = await svc.asignarCobrador(1, 100, 7);
    expect(r.cobradorNombre).toBe('Ana Cobradora');
    expect(prestamos[0].cobradorId).toBe(7);
  });

  it('reasignar a un cobrador que no pertenece a la empresa falla', async () => {
    const { svc } = buildDs();
    await expect(svc.asignarCobrador(1, 100, 999)).rejects.toThrow(NotFoundException);
  });

  it('reasignar a null desasigna — la cartera vuelve a sugerir al oficial', async () => {
    const { svc, prestamos } = buildDs();
    prestamos[0].oficialId = 3; prestamos[0].oficialNombre = 'Oficial Original';
    await svc.asignarCobrador(1, 100, 7);
    await svc.asignarCobrador(1, 100, null);
    expect(prestamos[0].cobradorId).toBeNull();

    const { data } = await svc.carteraVencida(1, {});
    expect(data[0].cobradorEfectivoId).toBe(3);
    expect(data[0].cobradorEfectivoNombre).toBe('Oficial Original');
  });

  it('el filtro "mi cartera" (cobradorId) solo devuelve los préstamos asignados a ese cobrador', async () => {
    const { svc } = buildDs();
    await svc.asignarCobrador(1, 100, 7);
    const propios = await svc.carteraVencida(1, { cobradorId: 7 });
    const ajenos  = await svc.carteraVencida(1, { cobradorId: 999 });
    expect(propios.data).toHaveLength(1);
    expect(ajenos.data).toHaveLength(0);
  });

  it('listarCobradores devuelve solo los usuarios activos de la empresa', async () => {
    const { svc } = buildDs();
    const cobradores = await svc.listarCobradores(1);
    expect(cobradores).toEqual([{ id: 7, nombre: 'Ana Cobradora', email: 'ana@financiera.test' }]);
  });

  it('notificarMora envía el email y registra la gestión a nombre de quien la disparó', async () => {
    const { svc, gestiones, emailService } = buildDs();
    const r = await svc.notificarMora(1, 100, ANA);
    expect(r.exitoso).toBe(true);
    expect(emailService.enviar).toHaveBeenCalled();
    expect(gestiones()).toHaveLength(1);
    expect(gestiones()[0].cobradorId).toBe(7);
    expect(gestiones()[0].tipo).toBe('mensaje');
  });

  it('notificarMora no registra nada si el envío de correo falla', async () => {
    const { svc, gestiones, emailService } = buildDs();
    emailService.enviar.mockResolvedValueOnce({ exitoso: false, error: 'SMTP caído' });
    await expect(svc.notificarMora(1, 100, ANA)).rejects.toThrow(BadRequestException);
    expect(gestiones()).toHaveLength(0);
  });

  it('linkWhatsappMora arma el link wa.me pero NO registra ninguna gestión sola (sin confirmación de entrega, igual que el resto del ERP)', async () => {
    const { svc, gestiones } = buildDs();
    const r = await svc.linkWhatsappMora(1, 100);
    // Mismo armado de número que PagosController.whatsapp() — ver ahí mismo.
    expect(r.link).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(r.link)).toContain('PR-0001');
    expect(gestiones()).toHaveLength(0);
  });

  it('resumenCobranza cuenta las promesas incumplidas de la cartera', async () => {
    const { svc, ayer } = buildDs();
    await svc.registrarGestion(1, {
      prestamoId: 100, descripcion: 'Promete pagar', resultado: 'promesa_pago', fechaPromesaPago: ayer,
    }, ANA);
    const r = await svc.resumenCobranza(1);
    expect(r.promesasIncumplidas).toBe(1);
    expect(r.totalMorosos).toBe(1);
  });

  it('operar sobre un préstamo de OTRA empresa siempre falla (multi-tenant)', async () => {
    const { svc } = buildDs();
    await expect(svc.registrarGestion(2, { prestamoId: 100, descripcion: 'x' }, ANA)).rejects.toThrow(NotFoundException);
    await expect(svc.asignarCobrador(2, 100, 7)).rejects.toThrow(NotFoundException);
    await expect(svc.notificarMora(2, 100, ANA)).rejects.toThrow(NotFoundException);
  });
});

// Punto 3 de docs/prestamista/decisiones-pendientes.md: los umbrales de
// escalamiento (antes fijos 5/15/30/60 para TODAS las financieras) ahora se
// leen de `empresa.configuracion` por empresa, con ese mismo default. El
// dispatcher de `buildDs()` arriba no evalúa el SQL real (el CASE WHEN se
// manda a Postgres, no a un parser), así que estas pruebas interceptan
// directamente el string de SQL que `carteraVencida()` ejecuta — es la
// única forma de demostrar qué umbral quedó realmente interpolado.
describe('CobranzaService.carteraVencida — umbrales de escalamiento configurables por empresa', () => {
  function buildDsConCfg(configuracion: Record<string, unknown> | undefined) {
    const sqlCapturado: string[] = [];
    const query = jest.fn(async (sql: string, _params: any[] = []): Promise<any[]> => {
      sqlCapturado.push(sql);
      if (sql.includes('SELECT configuracion FROM empresa')) {
        return configuracion === undefined ? [] : [{ configuracion }];
      }
      if (sql.includes('SELECT COUNT(*) FROM pr_prestamos p')) return [{ count: '0' }];
      if (sql.includes('"cobradorEfectivoId"')) return [];
      return [];
    });
    const svc = new CobranzaService({ query } as any, { enviar: jest.fn() } as any);
    return { svc, sqlCapturado };
  }

  it('sin configuración (empresa que nunca tocó el default): el SQL usa 5/15/30/60, igual que antes de ser configurable', async () => {
    const { svc, sqlCapturado } = buildDsConCfg(undefined);
    await svc.carteraVencida(1, {});
    const sqlPrincipal = sqlCapturado.find(s => s.includes('"cobradorEfectivoId"'))!;
    expect(sqlPrincipal).toContain(`>= 60`);
    expect(sqlPrincipal).toContain(`>= 30`);
    expect(sqlPrincipal).toContain(`>= 15`);
    expect(sqlPrincipal).toContain(`>= 5`);
  });

  it('con configuración custom por empresa: el SQL usa los umbrales guardados, no el default', async () => {
    const { svc, sqlCapturado } = buildDsConCfg({
      cobranzaUmbralRecordatorio: 3, cobranzaUmbralTelefonica: 10,
      cobranzaUmbralCarta: 20, cobranzaUmbralLegal: 45,
    });
    await svc.carteraVencida(1, {});
    const sqlPrincipal = sqlCapturado.find(s => s.includes('"cobradorEfectivoId"'))!;
    expect(sqlPrincipal).toContain(`>= 45`);
    expect(sqlPrincipal).toContain(`>= 20`);
    expect(sqlPrincipal).toContain(`>= 10`);
    expect(sqlPrincipal).toContain(`>= 3`);
    // Los defaults viejos no deben quedar colados en el SQL para esta empresa.
    expect(sqlPrincipal).not.toContain(`>= 60`);
  });

  it('configuración inválida (texto, negativo, 0) cae al default — nunca se interpola un valor no numérico', async () => {
    const { svc, sqlCapturado } = buildDsConCfg({
      cobranzaUmbralRecordatorio: 'pronto', cobranzaUmbralTelefonica: -5,
      cobranzaUmbralCarta: 0, cobranzaUmbralLegal: null,
    });
    await svc.carteraVencida(1, {});
    const sqlPrincipal = sqlCapturado.find(s => s.includes('"cobradorEfectivoId"'))!;
    expect(sqlPrincipal).toContain(`>= 60`);
    expect(sqlPrincipal).toContain(`>= 30`);
    expect(sqlPrincipal).toContain(`>= 15`);
    expect(sqlPrincipal).toContain(`>= 5`);
  });

  it('expone los umbrales vigentes en la respuesta (para que la UI los pueda mostrar/editar)', async () => {
    const { svc } = buildDsConCfg({ cobranzaUmbralLegal: 45 });
    const r = await svc.carteraVencida(1, {});
    expect(r.umbralesEscalamiento).toEqual({ recordatorio: 5, telefonica: 15, carta: 30, legal: 45 });
  });
});
