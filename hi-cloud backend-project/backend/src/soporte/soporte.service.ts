import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SoporteTicket, EstadoTicketSoporte, PrioridadTicketSoporte } from './entities/soporte-ticket.entity';
import { CreateSoporteTicketDto } from './dto/create-soporte-ticket.dto';
import { FiltroSoporteTicketsDto } from './dto/filtro-soporte-tickets.dto';
import { ResponderTicketDto } from './dto/responder-ticket.dto';
import { TenantService } from '../tenant/tenant.service';
import { EmailService } from '../notificaciones/services/email.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { User } from '../users/users.entity';

const ASUNTO_LABELS: Record<string, string> = {
  error_tecnico:       'Error técnico',
  duda_uso:            'Duda de uso',
  solicitud_funcion:   'Solicitud de función',
  facturacion:         'Facturación',
  certificacion_dgii:  'Certificación DGII (CerteCF)',
  otro:                'Otro',
};

@Injectable()
export class SoporteService {
  private readonly logger = new Logger(SoporteService.name);

  constructor(
    @InjectRepository(SoporteTicket) private repo: Repository<SoporteTicket>,
    private tenantService: TenantService,
    private emailService:  EmailService,
  ) {}

  /**
   * Nombre/correo se toman SIEMPRE de `usuario` (la sesión), nunca del DTO
   * — el DTO no tiene esos campos, así que ni siquiera hay un valor que
   * pudiera colarse. El contexto automático se arma aquí: lo que el
   * servidor conoce con certeza (empresaId, sucursalId, rol) gana siempre
   * sobre lo que mande el cliente, que solo aporta lo que él sabe (URL,
   * navegador, build_id) y el servidor no puede derivar.
   */
  async crear(dto: CreateSoporteTicketDto, usuario: User): Promise<SoporteTicket> {
    const empresaId = this.tenantService.getEmpresaIdOrNull();

    const contextoAutomatico = {
      empresaId,
      sucursalId:    (usuario as any).sucursalId ?? null,
      rol:           (usuario as any).role ?? null,
      usuarioNombre: usuario.nombre,
      usuarioEmail:  usuario.email,
      url:       dto.contexto?.url ?? null,
      modulo:    dto.contexto?.modulo ?? null,
      navegador: dto.contexto?.navegador ?? null,
      buildId:   dto.contexto?.buildId ?? null,
    };

    const ticket = this.repo.create({
      empresaId: empresaId ?? undefined,
      usuarioId: usuario.id,
      asunto:    dto.asunto,
      mensaje:   dto.mensaje,
      contextoAutomatico,
    });
    const guardado = await this.repo.save(ticket);

    // Fire-and-forget — un correo caído nunca debe impedir que el ticket
    // quede registrado (mismo criterio que enviarMensajeSoporte).
    this.notificarNuevoTicket(guardado, usuario).catch(err =>
      this.logger.warn(`No se pudo avisar por correo del ticket #${guardado.id}: ${(err as Error).message}`),
    );

    return guardado;
  }

  private async notificarNuevoTicket(ticket: SoporteTicket, usuario: User): Promise<void> {
    const dest  = process.env['NOTIF_ADMIN_EMAIL'] ?? 'soporte@hicloudrd.com';
    const label = ASUNTO_LABELS[ticket.asunto] ?? ticket.asunto;
    await this.emailService.enviar({
      to:      dest,
      replyTo: usuario.email,
      subject: `🎫 Nuevo ticket de soporte #${ticket.id} — ${label}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <div style="background:#1E3A8A;border-radius:10px 10px 0 0;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">🎫 Ticket #${ticket.id} — ${label}</h2>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
            <p style="margin:0 0 8px"><strong>De:</strong> ${usuario.nombre} (<a href="mailto:${usuario.email}" style="color:#2563EB">${usuario.email}</a>)</p>
            <p style="margin:0 0 16px"><strong>Empresa:</strong> #${ticket.empresaId ?? '—'}</p>
            <p style="margin:0 0 8px;font-weight:600">Mensaje:</p>
            <div style="background:#fff;border-left:4px solid #2563EB;border-radius:0 6px 6px 0;padding:12px 16px;color:#1E293B;line-height:1.6">
              ${ticket.mensaje.replace(/\n/g, '<br>')}
            </div>
            <p style="color:#94A3B8;font-size:11px;margin:20px 0 0">
              Puedes responder directamente a este correo — llegará a ${usuario.email}
            </p>
          </div>
        </div>
      `,
      text: `Ticket #${ticket.id} — ${label}\n\nDe: ${usuario.nombre} (${usuario.email})\nEmpresa: #${ticket.empresaId ?? '—'}\n\n${ticket.mensaje}`,
    });
  }

  async misTickets(usuario: User, pagination: PaginationDto) {
    const { limit = 10, page = 1 } = pagination as any;
    const empresaId = (usuario as any).empresaId ?? null;

    const qb = this.repo.createQueryBuilder('t')
      .where('t."usuarioId" = :usuarioId', { usuarioId: usuario.id })
      .andWhere('t."isActive" = true');
    // Multi-empresa: el mismo usuario puede operar más de una — solo se
    // muestran los tickets creados bajo la empresa activa de ESTA sesión.
    if (empresaId != null) qb.andWhere('t."empresaId" = :empresaId', { empresaId });
    else                    qb.andWhere('t."empresaId" IS NULL');

    const [data, total] = await qb
      .orderBy('t."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Solo Super Admin (guardado en el controller) — sin scope de empresa por diseño. */
  async listarParaAdmin(filtro: FiltroSoporteTicketsDto) {
    const { limit = 10, page = 1, estado, prioridad, empresaId, desde, hasta } = filtro as any;

    const qb = this.repo.createQueryBuilder('t').where('t."isActive" = true');
    if (estado)             qb.andWhere('t.estado = :estado', { estado });
    if (prioridad)          qb.andWhere('t.prioridad = :prioridad', { prioridad });
    if (empresaId != null)  qb.andWhere('t."empresaId" = :empresaId', { empresaId });
    if (desde)               qb.andWhere('t."createdAt" >= :desde', { desde });
    if (hasta)               qb.andWhere('t."createdAt" <= :hasta', { hasta });

    const [data, total] = await qb
      .orderBy('t."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async detalle(id: number): Promise<SoporteTicket> {
    const ticket = await this.repo.findOne({ where: { id, isActive: true } });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    return ticket;
  }

  async responder(id: number, dto: ResponderTicketDto, admin: User): Promise<SoporteTicket> {
    const ticket = await this.detalle(id);
    ticket.respuestaAdmin = dto.respuestaAdmin;
    ticket.respondidoPor  = admin.id;
    ticket.respondidoEn   = new Date();
    ticket.estado         = EstadoTicketSoporte.RESUELTO;
    const guardado = await this.repo.save(ticket);

    this.notificarRespuesta(guardado).catch(err =>
      this.logger.warn(`No se pudo avisar por correo la respuesta del ticket #${id}: ${(err as Error).message}`),
    );

    return guardado;
  }

  private async notificarRespuesta(ticket: SoporteTicket): Promise<void> {
    const email = (ticket.contextoAutomatico as any)?.usuarioEmail;
    if (!email) return; // ticket histórico sin contexto — nada a quién avisar
    await this.emailService.enviar({
      to:      email,
      subject: `✅ Respuesta a tu ticket de soporte #${ticket.id}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <div style="background:#059669;border-radius:10px 10px 0 0;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">✅ Tu ticket #${ticket.id} tiene respuesta</h2>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
            <p style="margin:0 0 8px;font-weight:600">Tu mensaje:</p>
            <div style="background:#fff;border-left:4px solid #94A3B8;border-radius:0 6px 6px 0;padding:12px 16px;color:#64748B;line-height:1.6;margin-bottom:16px">
              ${ticket.mensaje.replace(/\n/g, '<br>')}
            </div>
            <p style="margin:0 0 8px;font-weight:600">Respuesta:</p>
            <div style="background:#fff;border-left:4px solid #059669;border-radius:0 6px 6px 0;padding:12px 16px;color:#1E293B;line-height:1.6">
              ${(ticket.respuestaAdmin ?? '').replace(/\n/g, '<br>')}
            </div>
          </div>
        </div>
      `,
      text: `Tu ticket #${ticket.id} tiene respuesta\n\nTu mensaje:\n${ticket.mensaje}\n\nRespuesta:\n${ticket.respuestaAdmin}`,
    });
  }

  async cambiarEstado(id: number, estado: EstadoTicketSoporte): Promise<SoporteTicket> {
    const ticket = await this.detalle(id);
    ticket.estado = estado;
    return this.repo.save(ticket);
  }

  async cambiarPrioridad(id: number, prioridad: PrioridadTicketSoporte): Promise<SoporteTicket> {
    const ticket = await this.detalle(id);
    ticket.prioridad = prioridad;
    return this.repo.save(ticket);
  }
}
