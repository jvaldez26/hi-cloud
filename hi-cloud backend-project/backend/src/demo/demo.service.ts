import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { DemoRequest, EstadoDemo, NotaDemo } from './entities/demo-request.entity';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../notificaciones/services/email.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(DemoRequest)
    private demoRepository: Repository<DemoRequest>,
    private configService:  ConfigService,
    private emailService:   EmailService,
    private ds:             DataSource,
  ) {}

  // ── Crear solicitud ───────────────────────────────────────────────────────

  async crear(dto: CreateDemoRequestDto): Promise<DemoRequest> {
    const request = await this.demoRepository.save(
      this.demoRepository.create({
        ...dto,
        pais:  dto.pais ?? 'República Dominicana',
        notas: [],
      }),
    );

    this.logger.log(`📧 Nueva solicitud de demo: ${dto.nombre} — ${dto.empresa} (${dto.email})`);

    // Notificar a todos los super_admins por email (fire-and-forget)
    this.notificarSuperAdmins(request).catch(err =>
      this.logger.warn(`[Demo] Email a super_admin falló (no bloquea): ${err?.message}`),
    );

    return request;
  }

  // ── Email a super admins ──────────────────────────────────────────────────

  private async notificarSuperAdmins(demo: DemoRequest): Promise<void> {
    // Obtener todos los emails de usuarios super_admin activos
    const admins = await this.ds.query<{ email: string; nombre: string }[]>(
      `SELECT email, nombre FROM users WHERE role = 'super_admin' AND "isActive" = true`,
    );

    if (!admins.length) {
      this.logger.warn('[Demo] No hay super_admins activos para notificar');
      return;
    }

    const emails = admins.map(a => a.email);
    const fecha  = new Date().toLocaleString('es-DO', {
      timeZone: 'America/Santo_Domingo',
      dateStyle: 'full', timeStyle: 'short',
    });

    const panelUrl  = this.configService.get('FRONTEND_URL', 'https://app.hicloud.do') + '/super-admin?tab=demos';
    const modulos   = (demo.modulosInteres ?? []).join(', ') || '—';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: 'Inter', -apple-system, sans-serif; background: #F1F5F9; margin: 0; padding: 20px; }
  .card { background: #fff; border-radius: 12px; max-width: 520px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #1E293B, #0F172A); padding: 28px 32px; }
  .body { padding: 28px 32px; }
  .row { display: flex; gap: 8px; margin-bottom: 14px; }
  .label { color: #64748B; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; min-width: 100px; }
  .value { color: #0F172A; font-size: 14px; font-weight: 500; }
  .btn { display: inline-block; background: #F59E0B; color: #0F172A; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; margin-top: 8px; }
  .footer { background: #F8FAFC; padding: 16px 32px; font-size: 11px; color: #94A3B8; }
</style></head>
<body>
<div class="card">
  <div class="header">
    <div style="color:#F59E0B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">🎯 HiCloud ERP — Nueva Solicitud</div>
    <div style="color:#fff;font-size:22px;font-weight:800">${demo.empresa}</div>
    <div style="color:#94A3B8;font-size:14px;margin-top:4px">${demo.nombre}</div>
  </div>
  <div class="body">
    <div class="row"><span class="label">Nombre</span><span class="value">${demo.nombre}</span></div>
    <div class="row"><span class="label">Empresa</span><span class="value">${demo.empresa}</span></div>
    <div class="row"><span class="label">Email</span><span class="value"><a href="mailto:${demo.email}" style="color:#2563EB">${demo.email}</a></span></div>
    <div class="row"><span class="label">Teléfono</span><span class="value">${demo.telefono}</span></div>
    <div class="row"><span class="label">País</span><span class="value">${demo.pais}</span></div>
    <div class="row"><span class="label">Tamaño</span><span class="value">${demo.tamanoEmpresa} empleados</span></div>
    <div class="row"><span class="label">Módulos</span><span class="value">${modulos}</span></div>
    ${demo.mensaje ? `<div class="row"><span class="label">Mensaje</span><span class="value">${demo.mensaje}</span></div>` : ''}
    <div class="row"><span class="label">Fecha</span><span class="value">${fecha}</span></div>
    <a href="${panelUrl}" class="btn">👀 Ver en HiCloud Admin</a>
  </div>
  <div class="footer">
    Solicitud #${demo.id} · HiCloud ERP · Responde al prospecto en menos de 24h para maximizar la tasa de conversión
  </div>
</div>
</body>
</html>`;

    const { exitoso, error } = await this.emailService.enviar({
      to:      emails,
      subject: `🎯 Nueva solicitud de demo — ${demo.empresa}`,
      html,
    });

    if (exitoso) {
      this.logger.log(`[Demo] Email enviado a ${emails.join(', ')} para solicitud #${demo.id}`);
    } else {
      this.logger.warn(`[Demo] Email falló para solicitud #${demo.id}: ${error}`);
    }
  }

  // ── Listar con filtros ────────────────────────────────────────────────────

  async listar(filtro: {
    page?:   number;
    limit?:  number;
    estado?: EstadoDemo;
    search?: string;
    desde?:  string;
    hasta?:  string;
  }) {
    const { page = 1, limit = 20, estado, search, desde, hasta } = filtro;

    const qb = this.demoRepository
      .createQueryBuilder('d')
      .orderBy('d.createdAt', 'DESC');

    if (estado) qb.andWhere('d.estado = :estado', { estado });

    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      qb.andWhere(
        '(d.nombre ILIKE :q OR d.empresa ILIKE :q OR d.email ILIKE :q)',
        { q },
      );
    }

    if (desde) qb.andWhere('d.createdAt >= :desde', { desde });
    if (hasta) qb.andWhere('d.createdAt <= :hasta', { hasta: `${hasta} 23:59:59` });

    const [data, total] = await qb
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Detalle ───────────────────────────────────────────────────────────────

  async findOne(id: number): Promise<DemoRequest | null> {
    return this.demoRepository.findOne({ where: { id } });
  }

  // ── Actualizar estado ─────────────────────────────────────────────────────

  async actualizarEstado(id: number, update: {
    estado?:       EstadoDemo;
    notasInternas?: string;
    asignadoA?:    string;
    atendidoPor?:  number;
  }) {
    await this.demoRepository.update(id, update);
    return this.demoRepository.findOne({ where: { id } });
  }

  // ── Agregar nota estructurada ─────────────────────────────────────────────

  async agregarNota(
    id: number,
    texto: string,
    autorId?: number,
    autorNombre = 'Admin',
  ): Promise<DemoRequest | null> {
    const demo = await this.demoRepository.findOne({ where: { id } });
    if (!demo) return null;

    const nuevaNota: NotaDemo = {
      texto,
      autorId,
      autorNombre,
      fecha: new Date().toISOString(),
    };

    const notasActualizadas = [...(demo.notas ?? []), nuevaNota];
    await this.demoRepository.update(id, { notas: notasActualizadas });
    return this.demoRepository.findOne({ where: { id } });
  }

  // ── Estadísticas ──────────────────────────────────────────────────────────

  async getEstadisticas() {
    const rows = await this.demoRepository
      .createQueryBuilder('d')
      .select('d.estado', 'estado')
      .addSelect('COUNT(d.id)', 'cantidad')
      .groupBy('d.estado')
      .getRawMany();

    const total    = await this.demoRepository.count();
    const nuevas   = await this.demoRepository.count({ where: { estado: EstadoDemo.NUEVO } });
    const agendadas= await this.demoRepository.count({ where: { estado: EstadoDemo.DEMO_AGENDADA } });
    const hoy      = await this.demoRepository
      .createQueryBuilder('d')
      .where('DATE(d.createdAt) = CURRENT_DATE')
      .getCount();

    const convertidos = Number(
      rows.find(r => r.estado === EstadoDemo.CONVERTIDO)?.cantidad ?? 0,
    );
    const tasaConversion = total > 0 ? +((convertidos / total) * 100).toFixed(1) : 0;

    return {
      total,
      nuevas,
      agendadas,
      hoy,
      tasaConversion,
      porEstado: rows.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
    };
  }
}
