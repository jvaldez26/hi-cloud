import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { SolicitudAutorizacionRemota } from './entities/solicitud-autorizacion-remota.entity';
import { SupervisorPoliticaService } from '../supervisor-politicas/supervisor-politica.service';
import { CATALOGO_SUPERVISOR } from '../supervisor-politicas/supervisor-catalogo';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { PushService } from '../notificaciones/push.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';
import { TipoNotificacion } from '../notificaciones/entities/notificacion-enviada.entity';
import { CrearSolicitudAutorizacionRemotaDto, DecidirSolicitudAutorizacionRemotaDto } from './dto/crear-solicitud-autorizacion-remota.dto';

const TTL_SOLICITUD_MS = 3 * 60_000; // 3 minutos — mismo TTL que el token 'cada_vez'
const MAX_SOLICITUDES_POR_MINUTO = 5;

export interface ActorRequest { id: number; nombre: string; ip?: string; userAgent?: string }

@Injectable()
export class AutorizacionRemotaService {
  private readonly logger = new Logger(AutorizacionRemotaService.name);

  constructor(
    @InjectRepository(SolicitudAutorizacionRemota)
    private readonly repo: Repository<SolicitudAutorizacionRemota>,
    private readonly dataSource: DataSource,
    private readonly politicaService: SupervisorPoliticaService,
    private readonly notificaciones: NotificacionesService,
    private readonly push: PushService,
    private readonly realtime: RealtimeService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** `autorizacionRemotaActiva`/`autorizacionRemotaDestinatarios` — claves
   *  planas en empresa.configuracion (las escribe ConfiguracionPage vía
   *  updateEmpresa, mismo lugar que maxDiscountPercent); `.pos.*` solo de
   *  respaldo por si algo las guardó ahí vía el endpoint /pos-config viejo.
   *  Mismo criterio que ConfiguracionService.getPosConfig(), leído directo
   *  para no acoplar módulos. */
  private async getConfigEmpresa(empresaId: number): Promise<{ activa: boolean; destinatarios: number[] | null }> {
    const [row] = await this.dataSource.query<{ configuracion: Record<string, any> }[]>(
      `SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1`, [empresaId],
    );
    const conf = row?.configuracion ?? {};
    const pos = (conf.pos ?? {}) as any;
    const destinatarios = conf.autorizacionRemotaDestinatarios ?? pos.autorizacionRemotaDestinatarios;
    return {
      activa: conf.autorizacionRemotaActiva ?? pos.autorizacionRemotaActiva ?? true,
      destinatarios: Array.isArray(destinatarios) ? destinatarios : null,
    };
  }

  /** Ids de ADMIN/CONTADOR activos de la empresa — filtra por el rol EN ESTA
   *  empresa (usuario_empresa.rol), mismo criterio que
   *  NotificacionesService.getAdminUserIds (no por users.role global). */
  private async getAdminContadorIds(empresaId: number): Promise<number[]> {
    const rows = await this.dataSource.query<{ id: number }[]>(
      `SELECT ue."userId" AS id
       FROM usuario_empresa ue
       JOIN users u ON u.id = ue."userId"
       WHERE ue."empresaId" = $1 AND ue."isActive" = true
         AND u."isActive" = true AND ue.rol IN ('admin','contador')`,
      [empresaId],
    );
    return rows.map(r => r.id);
  }

  private async destinatarios(empresaId: number): Promise<number[]> {
    const { destinatarios } = await this.getConfigEmpresa(empresaId);
    if (destinatarios?.length) return destinatarios;
    return this.getAdminContadorIds(empresaId);
  }

  /** `estado` real — una fila 'pendiente' cuyo expiraEn ya pasó se ve como
   *  'expirada' sin necesitar un cron que la actualice en segundo plano. */
  private estadoReal(row: SolicitudAutorizacionRemota): string {
    if (row.estado === 'pendiente' && row.expiraEn.getTime() <= Date.now()) return 'expirada';
    return row.estado;
  }

  // ──────────────────────────────────────────────────────────────────
  // Crear
  // ──────────────────────────────────────────────────────────────────

  async crear(
    empresaId: number, cajero: ActorRequest, sucursalId: number | null, cajaId: number | null,
    dto: CrearSolicitudAutorizacionRemotaDto,
  ): Promise<SolicitudAutorizacionRemota> {
    const item = CATALOGO_SUPERVISOR.find(c => c.clave === dto.clave);
    if (!item) throw new BadRequestException(`Clave desconocida: ${dto.clave}`);

    const { requerido, permiteRemoto } = await this.politicaService.obtenerPolitica(empresaId, dto.clave);
    if (!requerido) {
      throw new BadRequestException('Esta acción no requiere autorización de supervisor — no hace falta pedirla.');
    }
    if (!permiteRemoto) {
      throw new ForbiddenException('Esta acción exige un supervisor presente — no admite autorización remota.');
    }

    const { activa: remotaActivaEmpresa } = await this.getConfigEmpresa(empresaId);
    if (!remotaActivaEmpresa) {
      throw new ForbiddenException('La autorización remota está desactivada para esta empresa.');
    }

    // Máximo una solicitud pendiente por caja (o por cajero, si la acción no
    // está ligada a una caja concreta) — evita que el mismo cajero acumule
    // solicitudes mientras sigue trabajando el carrito.
    const [pendiente] = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM solicitudes_autorizacion_remota
       WHERE "empresaId" = $1 AND "cajeroId" = $2 AND estado = 'pendiente' AND "expiraEn" > NOW()
         ${cajaId != null ? 'AND "cajaId" = $3' : ''}
       LIMIT 1`,
      cajaId != null ? [empresaId, cajero.id, cajaId] : [empresaId, cajero.id],
    );
    if (pendiente) {
      throw new BadRequestException('Ya hay una solicitud de autorización pendiente para esta caja — espera la respuesta o cancélala.');
    }

    // Límite de solicitudes por minuto — contra abuso/spam del botón.
    const [{ count }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM solicitudes_autorizacion_remota
       WHERE "cajeroId" = $1 AND "createdAt" >= NOW() - INTERVAL '1 minute'`,
      [cajero.id],
    );
    if (Number(count) >= MAX_SOLICITUDES_POR_MINUTO) {
      throw new BadRequestException('Demasiadas solicitudes de autorización en poco tiempo — espera un momento.');
    }

    const solicitud = await this.repo.save(this.repo.create({
      empresaId, cajeroId: cajero.id, cajeroNombre: cajero.nombre,
      sucursalId, cajaId, clave: dto.clave, estado: 'pendiente',
      motivo: dto.motivo, detalle: dto.detalle ?? null,
      facturaId: dto.facturaId ?? null, clienteId: dto.clienteId ?? null, monto: dto.monto ?? null,
      ip: cajero.ip ?? null, dispositivo: cajero.userAgent?.slice(0, 300) ?? null,
      expiraEn: new Date(Date.now() + TTL_SOLICITUD_MS),
    }));

    // Avisos — mejor esfuerzo, nunca bloquean la creación de la solicitud.
    this.avisarNuevaSolicitud(empresaId, solicitud, item.label).catch((e: Error) =>
      this.logger.error(`Error avisando solicitud #${solicitud.id}: ${e.message}`),
    );

    return solicitud;
  }

  private formatearMonto(monto: number): string {
    return 'RD$ ' + Number(monto).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Cuerpo legible de la notificación — cajero, ubicación, monto y
   * cliente/factura en una línea, más el motivo entre comillas (el texto
   * real que escribió el cajero, para que el supervisor sepa que es suyo).
   * Antes esto era genérico ("Nuevo aviso crítico" en el toast del
   * frontend) o, en el mejor de los casos, solo el motivo pelado sin
   * ningún dato de la acción — un supervisor no podía saber a qué estaba
   * autorizando sin abrir el detalle. Mismo patrón de lookup por SQL crudo
   * que ya usan facturas/cotizaciones/compras para resolver nombres de
   * sucursal (ver pdf.service.ts, cotizaciones.service.ts).
   */
  private async construirMensaje(s: SolicitudAutorizacionRemota): Promise<string> {
    const [sucursal, cliente, factura] = await Promise.all([
      s.sucursalId
        ? this.dataSource.query<{ nombre: string }[]>(`SELECT nombre FROM sucursales WHERE id = $1`, [s.sucursalId])
            .then(r => r[0]?.nombre ?? null).catch(() => null)
        : Promise.resolve(null),
      s.clienteId
        ? this.dataSource.query<{ nombre: string }[]>(`SELECT nombre FROM clientes WHERE id = $1`, [s.clienteId])
            .then(r => r[0]?.nombre ?? null).catch(() => null)
        : Promise.resolve(null),
      // Si ya hay cliente, el folio es ruido — una sola línea, no dos identificadores.
      s.facturaId && !s.clienteId
        ? this.dataSource.query<{ folio: string }[]>(`SELECT folio FROM facturas WHERE id = $1`, [s.facturaId])
            .then(r => r[0]?.folio ?? null).catch(() => null)
        : Promise.resolve(null),
    ]);

    const linea1 = s.cajeroNombre + (sucursal ? ` (${sucursal})` : '');

    const partes: string[] = [];
    if (s.monto != null) {
      const montoTxt = this.formatearMonto(Number(s.monto));
      partes.push(cliente ? `${montoTxt} a ${cliente}` : montoTxt);
    } else if (cliente) {
      partes.push(`Cliente: ${cliente}`);
    } else if (factura) {
      partes.push(`Factura ${factura}`);
    }
    partes.push(`Motivo: "${s.motivo}"`);

    return `${linea1} — ${partes.join(' · ')}`;
  }

  private async avisarNuevaSolicitud(empresaId: number, s: SolicitudAutorizacionRemota, labelClave: string): Promise<void> {
    const ids = await this.destinatarios(empresaId);
    // "Autorización solicitada: {acción}" — el nombre legible de la política
    // (CATALOGO_SUPERVISOR), no la clave cruda ni el nombre del cajero (que
    // ahora va en el cuerpo, junto con el resto del contexto).
    const asunto  = `Autorización solicitada: ${labelClave}`;
    const mensaje = await this.construirMensaje(s);
    await Promise.all(ids.map(userId =>
      this.notificaciones.notificarSistemaUsuario(
        userId, TipoNotificacion.AUTORIZACION_REMOTA_SOLICITADA, asunto, mensaje, String(s.id), empresaId,
      ).catch(() => {}),
    ));
    await Promise.all(ids.map(userId =>
      this.push.notificarUsuario(userId, { title: asunto, body: mensaje, url: `/autorizacion-remota?id=${s.id}` }).catch(() => {}),
    ));
    this.realtime.notify(empresaId, 'autorizacion_remota', 'created', s.id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Decidir
  // ──────────────────────────────────────────────────────────────────

  async decidir(
    empresaId: number, id: number, supervisor: ActorRequest, dto: DecidirSolicitudAutorizacionRemotaDto,
  ): Promise<Omit<SolicitudAutorizacionRemota, 'token'>> {
    const estadoFinal = dto.decision === 'aprobada' ? 'aprobada' : 'rechazada';

    // Atómico: la condición de carrera clásica (dos supervisores respondiendo
    // a la vez) se resuelve DENTRO del propio UPDATE repitiendo
    // `estado = 'pendiente'` — si otra request ya ganó, RETURNING viene
    // vacío y esta pierde, sin pisar la respuesta de la primera (mismo
    // patrón que SolicitudesService.decidir — prestamista).
    // "Nadie puede aprobar su propia solicitud" (conflicto de interés,
    // INCLUSO para ADMIN) se exige EN EL WHERE, no después — mismo criterio
    // estricto que CajaService.consumirTokenDescuadre para
    // 'cierre_caja_descuadre'.
    const [fila] = await this.dataSource.query<SolicitudAutorizacionRemota[]>(
      `WITH f AS (
         UPDATE solicitudes_autorizacion_remota
         SET estado = $1, "supervisorId" = $2, "supervisorNombre" = $3, comentario = $4, "respondidoEn" = NOW()
         WHERE id = $5 AND "empresaId" = $6 AND estado = 'pendiente' AND "expiraEn" > NOW()
           AND "cajeroId" <> $2
         RETURNING *
       ) SELECT * FROM f`,
      [estadoFinal, supervisor.id, supervisor.nombre, dto.comentario ?? null, id, empresaId],
    );

    if (!fila) {
      await this.explicarPorQueNoSeDecidio(empresaId, id, supervisor.id);
      throw new BadRequestException('No se pudo decidir la solicitud.'); // inalcanzable — la línea de arriba siempre lanza
    }

    if (estadoFinal === 'aprobada') {
      const tokenGenerado = await this.emitirTokenRemoto(empresaId, fila, supervisor);
      await this.repo.update(fila.id, { token: tokenGenerado });
    }

    await this.auditoria.registrar({
      userId: supervisor.id, userName: supervisor.nombre, empresaId,
      accion: AccionAuditoria.UPDATE,
      modulo: 'autorizacion-remota', entidad: 'SolicitudAutorizacionRemota', entidadId: String(fila.id),
      descripcion: `Solicitud #${fila.id} (${fila.clave}) de ${fila.cajeroNombre}: ${estadoFinal}` +
        (dto.comentario ? ` — "${dto.comentario}"` : ''),
      metodo: 'POST', ruta: `/autorizacion-remota/${fila.id}/decidir`, exitoso: true,
      ipAddress: supervisor.ip, userAgent: supervisor.userAgent,
    });

    // Avisa al cajero (y a cualquier otro supervisor viendo la lista de
    // pendientes) que ya se respondió — sin contenido en el socket, el POS
    // vuelve a preguntar GET /autorizacion-remota/:id/estado (mismo patrón
    // que notificarMensajeNuevo).
    this.realtime.notify(empresaId, 'autorizacion_remota', 'updated', fila.id);

    const { token, ...sinToken } = fila as any;
    return sinToken;
  }

  /** Nunca retorna — siempre lanza la excepción que explica por qué no se pudo decidir. */
  private async explicarPorQueNoSeDecidio(empresaId: number, id: number, supervisorId: number): Promise<never> {
    const [actual] = await this.dataSource.query<SolicitudAutorizacionRemota[]>(
      `SELECT * FROM solicitudes_autorizacion_remota WHERE id = $1 AND "empresaId" = $2`, [id, empresaId],
    );
    if (!actual) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (actual.cajeroId === supervisorId) {
      throw new ForbiddenException('No puedes aprobar o rechazar tu propia solicitud.');
    }
    if (actual.estado !== 'pendiente') {
      throw new BadRequestException(`Ya fue respondida por ${actual.supervisorNombre ?? 'otro supervisor'}.`);
    }
    throw new BadRequestException('Esta solicitud ya expiró — el cajero debe pedir una nueva.');
  }

  /** Emite el token de un solo uso (siempre 'cada_vez', 3 minutos) y deja la
   *  evidencia en pos_supervisor_log, igual que finalizarAutorizacionSupervisor
   *  (auth.service.ts) para la aprobación presencial — así el reporte de Modo
   *  Supervisor encuentra esta autorización con el mismo mecanismo de siempre,
   *  solo que con origen='remoto'. */
  private async emitirTokenRemoto(
    empresaId: number, s: SolicitudAutorizacionRemota, supervisor: ActorRequest,
  ): Promise<string> {
    const [log] = await this.dataSource.query<{ id: number }[]>(
      `INSERT INTO pos_supervisor_log
         ("empresaId", "cajeroId", "supervisorId", "supervisorNombre", action, detail, metodo, "sucursalId")
       VALUES ($1, $2, $3, $4, $5, $6, 'remoto', $7)
       RETURNING id`,
      [empresaId, s.cajeroId, supervisor.id, supervisor.nombre, s.clave, s.motivo, s.sucursalId ?? null],
    );

    const token = crypto.randomBytes(24).toString('hex');
    await this.dataSource.query(
      `INSERT INTO supervisor_autorizaciones
         ("empresaId", "cajeroId", "supervisorId", clave, token, usado, "expiraEn",
          origen, "facturaId", "clienteId", monto, "posSupervisorLogId", "solicitudRemotaId")
       VALUES ($1, $2, $3, $4, $5, false, NOW() + INTERVAL '3 minutes',
               'remoto', $6, $7, $8, $9, $10)`,
      [empresaId, s.cajeroId, supervisor.id, s.clave, token, s.facturaId ?? null, s.clienteId ?? null,
       s.monto ?? null, log.id, s.id],
    );
    return token;
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────────────

  async pendientes(empresaId: number): Promise<SolicitudAutorizacionRemota[]> {
    return this.repo.find({
      where: { empresaId, estado: 'pendiente' },
      order: { createdAt: 'ASC' },
    }).then(rows => rows.filter(r => r.expiraEn.getTime() > Date.now()));
  }

  async historial(empresaId: number, limit = 50): Promise<SolicitudAutorizacionRemota[]> {
    return this.repo.find({
      where: { empresaId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  /** Lo consulta el POS mientras espera — nunca expone el token de otra solicitud. */
  async estado(empresaId: number, id: number): Promise<{
    id: number; estado: string; comentario: string | null; supervisorNombre: string | null;
    token: string | null; expiraEn: string;
  }> {
    const row = await this.repo.findOne({ where: { empresaId, id } });
    if (!row) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    return {
      id: row.id,
      estado: this.estadoReal(row),
      comentario: row.comentario ?? null,
      supervisorNombre: row.supervisorNombre ?? null,
      token: row.estado === 'aprobada' ? (row.token ?? null) : null,
      expiraEn: row.expiraEn.toISOString(),
    };
  }

  /** Cancelar — solo el propio cajero, solo mientras está pendiente. */
  async cancelar(empresaId: number, id: number, cajeroId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE solicitudes_autorizacion_remota SET estado = 'cancelada', "respondidoEn" = NOW()
       WHERE id = $1 AND "empresaId" = $2 AND "cajeroId" = $3 AND estado = 'pendiente'`,
      [id, empresaId, cajeroId],
    );
    this.realtime.notify(empresaId, 'autorizacion_remota', 'updated', id);
  }
}
