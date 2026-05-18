import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Invitacion, EstadoInvitacion } from './entities/invitacion.entity';
import { User } from '../users/users.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { EmailService } from '../notificaciones/services/email.service';
import { ConfigService } from '@nestjs/config';
import { LimitesService } from '../suscripciones/limites.service';

@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name);

  constructor(
    @InjectRepository(Invitacion)       private invRepo:    Repository<Invitacion>,
    @InjectRepository(User)             private userRepo:   Repository<User>,
    @InjectRepository(UsuarioEmpresa)   private ueRepo:     Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)          private empRepo:    Repository<Empresa>,
    private emailService:   EmailService,
    private configService:  ConfigService,
    private limitesService: LimitesService,
  ) {}

  // ── Crear invitación ──────────────────────────────────────────────────────

  async crear(empresaId: number, email: string, rol: UserRole, invitadoPorId: number) {
    const empresa = await this.empRepo.findOne({ where: { id: empresaId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');

    const invitador = await this.userRepo.findOne({ where: { id: invitadoPorId } });
    if (!invitador) throw new NotFoundException('Usuario invitador no encontrado');

    // ── Verificar límite de usuarios del plan ANTES de enviar la invitación ──
    await this.limitesService.verificarLimiteUsuarios(empresaId);

    // Verificar si el usuario ya tiene acceso activo a esta empresa
    const userExistente = await this.userRepo.findOne({ where: { email } });
    if (userExistente) {
      const yaAsignado = await this.ueRepo.findOne({
        where: { userId: userExistente.id, empresaId, isActive: true },
      });
      if (yaAsignado) throw new ConflictException(`${email} ya tiene acceso a esta empresa`);
    }

    // Cancelar invitaciones pendientes anteriores del mismo email+empresa
    await this.invRepo.update(
      { email, empresaId, estado: EstadoInvitacion.PENDIENTE },
      { estado: EstadoInvitacion.CANCELADA },
    );

    const token     = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 horas

    const inv = await this.invRepo.save(this.invRepo.create({
      email, token, empresaId, rol,
      expiresAt, invitadoPorId,
      nombreEmpresa:    empresa.nombre,
      nombreInvitador:  invitador.nombre,
    }));

    const appUrl = this.configService.get(
      'APP_URL',
      process.env.FRONTEND_URL ?? 'https://hicloudrd.com',
    );
    const enlace = `${appUrl}/invitacion/${token}`;

    let emailEnviado = false;
    try {
      await this.enviarEmailInvitacion(inv, empresa.nombre, invitador.nombre, appUrl);
      emailEnviado = true;
    } catch (err) {
      this.logger.warn(`Email no enviado para invitación ${inv.id}: ${(err as Error).message}`);
    }

    return { ...inv, enlace, emailEnviado };
  }

  // ── Email de invitación ───────────────────────────────────────────────────

  private async enviarEmailInvitacion(
    inv: Invitacion, nombreEmpresa: string, nombreInvitador: string,
    appUrl?: string,
  ) {
    const url    = appUrl ?? this.configService.get('APP_URL', 'https://hicloudrd.com');
    const enlace = `${url}/invitacion/${inv.token}`;
    const rolLabel: Record<string, string> = {
      admin: 'Administrador', contador: 'Contador', vendedor: 'Vendedor', viewer: 'Solo lectura',
    };

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#f8fafc; margin:0; padding:0; }
  .wrap { max-width:520px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .header { background:linear-gradient(135deg,#1a56db,#0ea5e9); padding:32px 40px; text-align:center; }
  .logo { width:40px; height:40px; background:rgba(255,255,255,.25); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#fff; margin-bottom:12px; }
  .header h1 { color:#fff; margin:0; font-size:22px; font-weight:700; }
  .body { padding:32px 40px; }
  .empresa { background:#eff6ff; border-radius:10px; padding:14px 20px; margin:20px 0; display:flex; align-items:center; gap:12px; }
  .empresa-icon { font-size:24px; }
  .empresa-name { font-size:16px; font-weight:700; color:#1e293b; }
  .rol-badge { display:inline-block; background:#1a56db; color:#fff; border-radius:6px; padding:3px 10px; font-size:12px; font-weight:600; }
  .btn { display:block; background:linear-gradient(135deg,#1a56db,#0ea5e9); color:#fff!important; text-decoration:none; text-align:center; padding:14px 28px; border-radius:10px; font-size:16px; font-weight:600; margin:24px 0; }
  .footer { text-align:center; padding:20px 40px; background:#f8fafc; border-top:1px solid #e2e8f0; }
  .footer p { font-size:12px; color:#94a3b8; margin:4px 0; }
  .expire { font-size:12px; color:#f59e0b; margin-top:16px; }
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">H</div>
    <h1>Invitación a HiCloud ERP</h1>
  </div>
  <div class="body">
    <p style="color:#475569;font-size:15px;">Hola,</p>
    <p style="color:#475569;font-size:15px;">
      <strong>${nombreInvitador}</strong> te ha invitado a colaborar en el sistema ERP de:
    </p>
    <div class="empresa">
      <span class="empresa-icon">🏢</span>
      <div>
        <div class="empresa-name">${nombreEmpresa}</div>
        <span class="rol-badge">${rolLabel[inv.rol] ?? inv.rol}</span>
      </div>
    </div>
    <p style="color:#475569;font-size:14px;">
      Con el rol de <strong>${rolLabel[inv.rol] ?? inv.rol}</strong> podrás acceder al sistema
      según los permisos asignados.
    </p>
    <a href="${enlace}" class="btn">✓ Aceptar invitación y crear cuenta</a>
    <p class="expire">⏱️ Este enlace expira en <strong>48 horas</strong>.</p>
    <p style="color:#94a3b8;font-size:12px;">Si no esperabas esta invitación, ignora este correo.</p>
  </div>
  <div class="footer">
    <p><strong>HiCloud ERP</strong> · República Dominicana</p>
    <p>Cumplimiento DGII · Sistema e-CF</p>
  </div>
</div>
</body></html>`;

    await this.emailService.enviar({
      to:      inv.email,
      subject: `${nombreInvitador} te invita a ${nombreEmpresa} — HiCloud ERP`,
      html,
      text:    `Accede a la invitación en: ${enlace}`,
    });

    this.logger.log(`Invitación enviada a ${inv.email} para empresa ${nombreEmpresa}`);
  }

  // ── Consultar invitación por token (pública) ──────────────────────────────

  async getByToken(token: string) {
    const inv = await this.invRepo.findOne({ where: { token } });
    if (!inv) throw new NotFoundException('Invitación no encontrada');
    if (inv.estado !== EstadoInvitacion.PENDIENTE)
      throw new BadRequestException(`Esta invitación ya fue ${inv.estado}`);
    if (new Date() > inv.expiresAt) {
      await this.invRepo.update(inv.id, { estado: EstadoInvitacion.EXPIRADA });
      throw new BadRequestException('Esta invitación ha expirado. Solicita una nueva al administrador.');
    }
    const userExiste = await this.userRepo.findOne({ where: { email: inv.email } });
    return {
      email:          inv.email,
      nombreEmpresa:  inv.nombreEmpresa,
      nombreInvitador:inv.nombreInvitador,
      rol:            inv.rol,
      expiresAt:      inv.expiresAt,
      userExiste:     !!userExiste,
    };
  }

  // ── Aceptar invitación ────────────────────────────────────────────────────

  async aceptar(token: string, nombre?: string, password?: string) {
    const inv = await this.invRepo.findOne({ where: { token } });
    if (!inv) throw new NotFoundException('Invitación no encontrada');
    if (inv.estado !== EstadoInvitacion.PENDIENTE)
      throw new BadRequestException(`Esta invitación ya fue ${inv.estado}`);
    if (new Date() > inv.expiresAt) {
      await this.invRepo.update(inv.id, { estado: EstadoInvitacion.EXPIRADA });
      throw new BadRequestException('Invitación expirada');
    }

    // ── Verificar límite de usuarios en el momento de aceptar ─────────────
    // Doble validación: por si el plan bajó entre el envío y la aceptación
    await this.limitesService.verificarLimiteUsuarios(inv.empresaId);

    let user = await this.userRepo.findOne({ where: { email: inv.email } });

    if (!user) {
      // Crear nuevo usuario
      if (!nombre || nombre.trim().length < 2) throw new BadRequestException('Nombre completo requerido (mínimo 2 caracteres)');
      if (!password || password.length < 6)    throw new BadRequestException('Contraseña requerida (mínimo 6 caracteres)');
      const hash = await bcrypt.hash(password, 12);
      user = await this.userRepo.save(this.userRepo.create({
        nombre, email: inv.email, password: hash, role: inv.rol,
      }));
    } else {
      // El rol de la invitación es autoritativo — actualizar User.role siempre,
      // excepto si ya es super_admin (no se degrada al super admin nunca)
      if (user.role !== UserRole.SUPER_ADMIN) {
        await this.userRepo.update(user.id, { role: inv.rol as UserRole });
        user.role = inv.rol as UserRole;
      }
    }

    // Asignar a la empresa
    const yaAsignado = await this.ueRepo.findOne({ where: { userId: user.id, empresaId: inv.empresaId } });
    if (!yaAsignado) {
      // Si el usuario no tiene ninguna empresa activa (ej: su empresa anterior fue eliminada),
      // marcar esta como principal. Si ya tiene otra empresa principal activa, no tocar ese flag.
      const tieneEmpresaActivaPrincipal = await this.ueRepo.findOne({
        where: { userId: user.id, isPrincipal: true, isActive: true },
      });
      await this.ueRepo.save(this.ueRepo.create({
        userId:      user.id,
        empresaId:   inv.empresaId,
        rol:         inv.rol,
        isPrincipal: !tieneEmpresaActivaPrincipal,  // principal solo si no tiene otra activa
      }));
    } else {
      await this.ueRepo.update(yaAsignado.id, { rol: inv.rol, isActive: true });
    }

    // Marcar invitación como aceptada
    await this.invRepo.update(inv.id, { estado: EstadoInvitacion.ACEPTADA });

    return { mensaje: 'Invitación aceptada', userId: user.id, empresaId: inv.empresaId };
  }

  // ── Listar invitaciones de una empresa ────────────────────────────────────

  async listarPorEmpresa(empresaId: number) {
    return this.invRepo.find({
      where: { empresaId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Cancelar invitación ───────────────────────────────────────────────────

  async cancelar(id: number) {
    const inv = await this.invRepo.findOne({ where: { id } });
    if (!inv) throw new NotFoundException('Invitación no encontrada');
    await this.invRepo.update(id, { estado: EstadoInvitacion.CANCELADA });
    return { ok: true };
  }
}
