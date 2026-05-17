import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { RefreshTokenService } from './refresh-token.service';
import { EmailService } from '../notificaciones/services/email.service';
import { User } from '../users/users.entity';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService:       UsersService,
    private jwtService:         JwtService,
    private emailService:       EmailService,
    private blacklistSvc:       TokenBlacklistService,
    private refreshTokenSvc:    RefreshTokenService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UsuarioEmpresa)
    private ueRepository: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectRepository(Sucursal)
    private sucursalRepository: Repository<Sucursal>,
    private contabilidadService: ContabilidadService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS "sessionToken"      VARCHAR(64),
          ADD COLUMN IF NOT EXISTS "sessionCreatedAt"  TIMESTAMPTZ
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS "IDX_users_sessionToken" ON users("sessionToken")
      `);
    } catch (e) {
      this.logger.warn('Session columns migration (ignorado): ' + e);
    }
  }

  /** Inicia nueva sesión: genera sessionToken, revoca refresh tokens anteriores. */
  private async initNewSession(user: User): Promise<string> {
    const sessionToken = randomUUID();
    await this.userRepository.update(user.id, {
      sessionToken,
      sessionCreatedAt: new Date(),
    });
    user.sessionToken      = sessionToken;
    user.sessionCreatedAt  = new Date();
    await this.refreshTokenSvc.revocarTodos(user.id);
    return sessionToken;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async getEmpresaPrincipal(userId: number): Promise<number | undefined> {
    const principal = await this.ueRepository.findOne({
      where: { userId, isPrincipal: true, isActive: true },
    });
    if (principal) return principal.empresaId;

    // Fallback: primera empresa del usuario
    const primera = await this.ueRepository.findOne({
      where: { userId, isActive: true },
      order: { id: 'ASC' },
    });
    return primera?.empresaId;
  }

  private buildToken(user: User, empresaId?: number): string {
    // S-27: jti único por token — permite revocación individual en blacklist
    // S-31: roleVersion en JWT para detectar cambios de rol sin ir a BD en cada request
    return this.jwtService.sign({
      sub:          user.id,
      email:        user.email,
      role:         user.role,
      empresaId:    empresaId ?? null,
      jti:          randomUUID(),
      sessionToken: user.sessionToken ?? undefined,
      roleVersion:  (user as any).roleVersion ?? 1,
    });
  }

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    this.logger.log(`[REGISTER] nombre="${dto.nombre}" | empresa="${dto.empresaNombre ?? 'N/A'}"`);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('El email ya está registrado');

    if (dto.empresaRnc) {
      const rncExiste = await this.empresaRepository.findOne({ where: { rnc: dto.empresaRnc } });
      if (rncExiste) throw new ConflictException(`El RNC ${dto.empresaRnc} ya está registrado`);
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const user = await qr.manager.save(
        qr.manager.create(User, {
          nombre:   dto.nombre,
          email:    dto.email,
          password: hashed,
          role:     UserRole.ADMIN,
          isActive: true,
        }),
      );

      if (dto.empresaNombre && dto.empresaRnc) {
        const empresa = await qr.manager.save(
          qr.manager.create(Empresa, {
            nombre:      dto.empresaNombre,
            rnc:         dto.empresaRnc,
            moneda:      'DOP',
            zonaHoraria: 'America/Santo_Domingo',
          }),
        );

        await qr.manager.save(
          qr.manager.create(UsuarioEmpresa, {
            userId:      user.id,
            empresaId:   empresa.id,
            rol:         UserRole.ADMIN,
            isPrincipal: true,
          }),
        );

        await qr.manager.save(
          qr.manager.create(Sucursal, {
            empresaId:   empresa.id,
            codigo:      'PRIN',
            nombre:      'Sucursal Principal',
            ciudad:      'Santo Domingo',
            esPrincipal: true,
          }),
        );

        // Crear suscripción PRUEBA con el plan elegido — el reloj de 15 días empieza aquí
        const planElegido = dto.planElegido ?? 'emprendedor';
        const fechaFinPrueba = new Date(); fechaFinPrueba.setDate(fechaFinPrueba.getDate() + 15);
        await qr.manager.query(
          `INSERT INTO suscripciones
             ("empresaId", plan, estado, "fechaInicio", "fechaVencimiento",
              "fechaFinPrueba", "planElegidoEnRegistro", "modalidad")
           VALUES ($1, $2, 'prueba', NOW(), $3, $3, $2, 'mensual')`,
          [empresa.id, planElegido, fechaFinPrueba.toISOString()],
        );

        await qr.commitTransaction();
        this.logger.log(`Empresa "${empresa.nombre}" (id=${empresa.id}) creada para usuario #${user.id} | plan=${planElegido}`);

        // Tareas post-commit: no forman parte de la transacción atómica
        this.contabilidadService.seedPlanCuentas(empresa.id).catch(err =>
          this.logger.warn(`seedPlanCuentas empresa ${empresa.id}: ${err?.message}`),
        );
      } else {
        await qr.commitTransaction();
      }

      // Correo de verificación — post-commit, no revertir la TX si falla
      this.sendVerificationEmail(user.id, user.email, user.nombre).catch(err =>
        this.logger.warn(`No se pudo enviar verificación: ${err?.message}`),
      );

      return {
        message: 'Cuenta creada. Revisa tu correo para verificar tu cuenta antes de iniciar sesión.',
        user: { id: user.id, nombre: user.nombre, email: user.email },
      };
    } catch (e: any) {
      await qr.rollbackTransaction();
      if (e instanceof ConflictException || e instanceof BadRequestException) throw e;
      // S-52: race condition en RNC — dos registros simultáneos del mismo RNC
      if (e?.code === '23505' && e?.detail?.includes('rnc')) {
        throw new ConflictException(`El RNC ${dto.empresaRnc ?? ''} ya está registrado`);
      }
      if (e?.code === '23505' && e?.detail?.includes('email')) {
        throw new ConflictException('El email ya está registrado');
      }
      this.logger.error(`[REGISTER] Error: ${e?.message}`);
      throw new InternalServerErrorException('Error al crear la cuenta. Inténtalo de nuevo.');
    } finally {
      await qr.release();
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailForAuth(dto.email);
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new UnauthorizedException('Credenciales inválidas');

    // S-40: No revelar si el usuario existe — mensaje genérico en ambos casos.
    // Si el correo no está verificado, reenviar email en background (UX amigable)
    // y devolver el mismo error que credenciales inválidas.
    if (!user.emailVerifiedAt) {
      this.sendVerificationEmail(user.id, user.email, user.nombre).catch(() => null);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Desplazar sesión anterior: nuevo sessionToken + revocar refresh tokens previos
    await this.initNewSession(user);

    const empresaId    = await this.getEmpresaPrincipal(user.id);
    const accessToken  = this.buildToken(user, empresaId);

    // Lista de empresas del usuario
    const empresas = await this.ueRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });

    return {
      message: 'Login exitoso',
      accessToken,
      empresaActual: empresaId ?? null,
      empresas: empresas.map(e => ({
        empresaId:   e.empresaId,
        nombre:      e.empresa?.nombre,
        rnc:         e.empresa?.rnc,
        rol:         e.rol,
        isPrincipal: e.isPrincipal,
      })),
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
    };
  }

  // ─── Cambiar empresa activa ───────────────────────────────────────────────────

  async cambiarEmpresa(userId: number, userRole: string, empresaId: number) {
    // Solo SUPER_ADMIN puede cambiar a cualquier empresa sin tener membresía
    if (userRole !== UserRole.SUPER_ADMIN) {
      const acceso = await this.ueRepository.findOne({
        where: { userId, empresaId, isActive: true },
        relations: ['empresa'],
      });
      if (!acceso) throw new ForbiddenException(`Sin acceso a empresa #${empresaId}`);
    }

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const accessToken = this.buildToken(user, empresaId);

    return {
      message:       `Empresa activa cambiada a #${empresaId}`,
      accessToken,
      empresaActual: empresaId,
    };
  }

  // ─── Mis empresas ─────────────────────────────────────────────────────────────

  async misEmpresas(userId: number, isGlobalAdmin = false) {
    const accesos = await this.ueRepository.find({
      where: { userId, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });

    if (accesos.length > 0) {
      return accesos.map(a => ({
        empresaId:   a.empresaId,
        nombre:      a.empresa?.nombre ?? `Empresa #${a.empresaId}`,
        rnc:         a.empresa?.rnc,
        rol:         a.rol,
        isPrincipal: a.isPrincipal,
        plan:        (a.empresa as any)?.planSuscripcion ?? 'TRIAL',
      }));
    }

    // Admin global sin vínculos explícitos → devuelve todas las empresas
    if (isGlobalAdmin) {
      const todas = await this.empresaRepository.find({ where: { isActive: true }, order: { nombre: 'ASC' } });
      return todas.map(e => ({
        empresaId:   e.id,
        nombre:      e.nombre,
        rnc:         e.rnc,
        rol:         'admin',
        isPrincipal: false,
        plan:        (e as any).planSuscripcion ?? 'TRIAL',
      }));
    }

    return [];
  }

  // ─── Password Reset ───────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.userRepository.findOne({ where: { email, isActive: true } });

    if (!user) {
      this.logger.log(`Reset solicitado para email no encontrado: ${email}`);
      return { message: 'Si el email existe, recibirás las instrucciones en breve.' };
    }

    const token  = randomUUID().replace(/-/g, '');
    const expiry = new Date(); expiry.setHours(expiry.getHours() + 1);

    await this.userRepository.update(user.id, {
      resetPasswordToken:   token,
      resetPasswordExpires: expiry,
    });

    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com'}/restablecer/${token}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
    .card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
    .header{background:linear-gradient(135deg,#1a56db,#0ea5e9);padding:28px;color:#fff;text-align:center}
    .body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#1a56db,#0ea5e9);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
    .footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
    <body><div class="card">
      <div class="header"><h2 style="margin:0">🔐 Restablece tu contraseña</h2></div>
      <div class="body">
        <p>Hola <strong>${user.nombre}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en HiCloud ERP.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" class="btn">Restablecer contraseña</a>
        </p>
        <p style="color:#6b7280;font-size:13px">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este email.</p>
        <p style="color:#9ca3af;font-size:12px">O copia este enlace en tu navegador:<br/>${resetUrl}</p>
      </div>
      <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
    </div></body></html>`;

    await this.emailService.enviar({ to: email, subject: 'Restablece tu contraseña — HiCloud ERP', html });
    this.logger.log(`Token de reset enviado a: ${email}`);
    return { message: 'Si el email existe, recibirás las instrucciones en breve.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: token },
      select: ['id', 'resetPasswordToken', 'resetPasswordExpires', 'isActive'],
    });

    if (!user || !user.isActive) throw new BadRequestException('Token inválido o expirado');
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita uno nuevo.');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(user.id, {
      password:             hashed,
      resetPasswordToken:   null as any,
      resetPasswordExpires: null as any,
    });

    this.logger.log(`Contraseña restablecida para usuario #${user.id}`);
    return { message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' };
  }

  // ─── Cambio de contraseña autenticado ────────────────────────────────────────

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.userRepository
      .createQueryBuilder('u')
      .select(['u.id', 'u.isActive'])
      .addSelect('u.password')          // select:false requiere addSelect
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user || !user.isActive) throw new UnauthorizedException('Usuario no encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw new BadRequestException('La contraseña actual es incorrecta');

    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userRepository
      .createQueryBuilder()
      .update()
      .set({ password: hashed })
      .where('id = :id', { id: userId })
      .execute();

    this.logger.log(`Contraseña cambiada por usuario #${userId}`);
    return { message: 'Contraseña actualizada exitosamente' };
  }

  // ─── Email verification ───────────────────────────────────────────────────────

  async sendVerificationEmail(userId: number, email: string, nombre: string): Promise<void> {
    const token   = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.userRepository.update(userId, {
      emailVerificationToken:   token,
      emailVerificationExpires: expires,
    } as any);

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    const link = `${frontendUrl}/verificar-correo?token=${token}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{font-family:'Inter',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.card{background:#fff;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.header{background:linear-gradient(135deg,#059669,#10b981);padding:28px;color:#fff;text-align:center}
.body{padding:28px}.btn{display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:16px}
.footer{padding:16px;text-align:center;font-size:12px;color:#9ca3af}</style></head>
<body><div class="card">
  <div class="header"><h2 style="margin:0">✅ Verifica tu correo</h2></div>
  <div class="body">
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Gracias por registrarte en HiCloud ERP. Haz clic en el botón para verificar tu cuenta:</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" class="btn">Verificar mi correo</a></p>
    <p style="color:#6b7280;font-size:13px">Este enlace expira en <strong>24 horas</strong>.</p>
    <p style="color:#9ca3af;font-size:12px">O copia este enlace:<br/>${link}</p>
  </div>
  <div class="footer">© 2026 HiCloud ERP · República Dominicana</div>
</div></body></html>`;

    await this.emailService.enviar({
      to:      email,
      subject: 'Verifica tu correo — HiCloud ERP',
      html,
    });
    this.logger.log(`Correo de verificación enviado a: ${email}`);
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token } as any,
      // email y nombre incluidos — necesarios para el email de bienvenida
      select: ['id', 'nombre', 'email', 'emailVerifiedAt', 'emailVerificationExpires', 'isActive'] as any,
    });

    if (!user) throw new BadRequestException('Token inválido o expirado');

    if ((user as any).emailVerifiedAt) {
      return { message: 'Tu correo ya fue verificado. Ya puedes iniciar sesión.' };
    }

    const expires: Date | undefined = (user as any).emailVerificationExpires;
    if (expires && expires < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita un nuevo correo de verificación.');
    }

    // No anulamos emailVerificationToken — si el endpoint se llama dos veces
    // (StrictMode, SW reload), la segunda llamada encontrará al usuario,
    // verá emailVerifiedAt ya establecido y devolverá éxito silencioso.
    await this.userRepository.update(user.id, {
      emailVerifiedAt:          new Date(),
      emailVerificationExpires: null,
    } as any);

    // La suscripción PRUEBA se crea durante el registro (no aquí).
    // Si por alguna razón no existe, crearla como fallback.
    const ueRow = await this.ueRepository.findOne({
      where: { userId: user.id, isActive: true, isPrincipal: true },
    });
    if (ueRow) {
      const yaExiste = await this.dataSource.query<any[]>(
        `SELECT id FROM suscripciones WHERE "empresaId" = $1 LIMIT 1`,
        [ueRow.empresaId],
      );
      if (!yaExiste.length) {
        const fin = new Date(); fin.setDate(fin.getDate() + 15);
        await this.dataSource.query(
          `INSERT INTO suscripciones
             ("empresaId", plan, estado, "fechaInicio", "fechaVencimiento",
              "fechaFinPrueba", "planElegidoEnRegistro", "modalidad")
           VALUES ($1, 'emprendedor', 'prueba', NOW(), $2, $2, 'emprendedor', 'mensual')`,
          [ueRow.empresaId, fin.toISOString()],
        );
        this.logger.log(`Suscripción PRUEBA fallback creada para empresa #${ueRow.empresaId}`);
      }
    }

    this.logger.log(`Email verificado para usuario #${user.id}`);

    // Email de bienvenida con info del plan elegido (non-fatal)
    if (ueRow) {
      this.enviarEmailBienvenida(user.id, (user as any).nombre, (user as any).email ?? '', ueRow.empresaId)
        .catch(() => null);
    }

    return { message: '¡Correo verificado exitosamente! Ya puedes iniciar sesión.' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email, isActive: true },
      select: ['id', 'nombre', 'email', 'emailVerifiedAt'] as any,
    });

    // Respuesta neutra — no revelar si el email existe
    const response = { message: 'Si el correo existe y no está verificado, recibirás un nuevo enlace.' };

    if (!user || (user as any).emailVerifiedAt) return response;

    // Rate limit: no reenviar si el token vigente tiene menos de 5 min
    const existingExpires: Date | undefined = (user as any).emailVerificationExpires;
    const tokenReciente = existingExpires && existingExpires > new Date(Date.now() - 5 * 60_000);
    if (tokenReciente) return response;

    await this.sendVerificationEmail(user.id, user.email, user.nombre).catch(() => null);
    return response;
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────────

  /** Busca o crea un usuario a partir del perfil de Google */
  async findOrCreateFromGoogle(data: {
    email: string; googleId: string; nombre: string;
  }): Promise<User> {
    // 1. Buscar por googleId primero
    let user = await this.userRepository.findOne({
      where: { googleId: data.googleId } as any,
    });
    if (user) return user;

    // 2. Buscar por email (cuenta local existente → vincular)
    user = await this.userRepository.findOne({ where: { email: data.email } });
    if (user) {
      const updates: Record<string, any> = { googleId: data.googleId, provider: 'GOOGLE' };
      // Si el usuario quedó como VIEWER sin empresa (registro Google incompleto),
      // promoverlo a ADMIN para que pueda completar la creación de su empresa.
      if ((user as any).role === UserRole.VIEWER || (user as any).role === 'viewer') {
        const sinEmpresa = await this.ueRepository.count({
          where: { userId: user.id, isActive: true },
        });
        if (sinEmpresa === 0) updates.role = UserRole.ADMIN;
      }
      await this.userRepository.update(user.id, updates as any);
      return { ...user, ...updates } as User;
    }

    // 3. Crear cuenta nueva — el registro con Google es siempre auto-registro (admin de su empresa)
    const pw = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const newUser = this.userRepository.create({
      nombre:          data.nombre,
      email:           data.email,
      password:        pw,
      googleId:        data.googleId,
      provider:        'GOOGLE',
      role:            UserRole.ADMIN,  // auto-registro = admin de su empresa
      emailVerifiedAt: new Date(),      // Google ya verificó el email
    } as any);
    return this.userRepository.save(newUser) as unknown as User;
  }

  async marcarTourCompletado(userId: number): Promise<void> {
    await this.userRepository.update(userId, { tourCompletado: true } as any);
  }

  private async enviarEmailBienvenida(userId: number, nombre: string, email: string, empresaId: number): Promise<void> {
    try {
      // Leer la suscripción para saber plan y fecha de vencimiento
      const [sus] = await this.dataSource.query<any[]>(
        `SELECT plan, estado, "fechaFinPrueba" FROM suscripciones WHERE "empresaId" = $1 LIMIT 1`,
        [empresaId],
      );
      if (!sus) return;

      const PLAN_NOMBRE: Record<string, string> = {
        emprendedor: 'Emprendedor', pyme: 'Pyme', pro: 'Pro', plus: 'Plus',
      };
      const PLAN_PRECIO: Record<string, number> = {
        emprendedor: 29, pyme: 59, pro: 89, plus: 129,
      };
      const planNombre = PLAN_NOMBRE[sus.plan] ?? sus.plan;
      const precioMes  = PLAN_PRECIO[sus.plan] ?? 0;
      const fechaFin   = sus.fechaFinPrueba
        ? new Date(sus.fechaFinPrueba).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })
        : '15 días desde hoy';
      const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';

      await this.emailService.enviar({
        to: email,
        subject: `¡Bienvenido a HiCloud ERP! Tu prueba ${planNombre} empieza ahora`,
        html: `
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>¡Tu cuenta en HiCloud ERP está activa! 🎉</p>
          <p>Tienes acceso completo al plan <strong>${planNombre}</strong> (US$${precioMes}/mes) de forma gratuita hasta el <strong>${fechaFin}</strong>.</p>
          <p>Todos los módulos están habilitados desde el primer día:</p>
          <ul>
            <li>✅ Factura electrónica e-CF DGII</li>
            <li>✅ Contabilidad, inventario y CxC/CxP</li>
            <li>✅ Nómina, compras y reportes 606/607</li>
            <li>✅ Soporte 24/7 incluido</li>
          </ul>
          <p>Al vencer la prueba, un asesor te contactará para coordinar el pago y continuar sin interrupciones.</p>
          <p><a href="${frontendUrl}/dashboard" style="background:#1565C0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700">Entrar al sistema →</a></p>
          <p style="color:#6b7280;font-size:12px">¿Tienes dudas? Escríbenos a soporte@hicloudrd.com</p>
        `,
      });
    } catch (e) {
      this.logger.warn(`Email bienvenida usuario #${userId}: ${(e as Error).message}`);
    }
  }

  /** S-28: Genera un access token para un userId (usado en /auth/refresh) */
  async buildAccessTokenForUser(userId: number): Promise<string> {
    const user = await this.usersService.findById(userId);
    const empresaId = await this.getEmpresaPrincipal(userId);
    return this.buildToken(user, empresaId);
  }

  /** Super admin: fuerza el logout de un usuario limpiando su sessionToken. */
  async forzarLogout(userId: number) {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) throw new BadRequestException(`Usuario #${userId} no encontrado`);
    await this.userRepository.update(userId, { sessionToken: undefined, sessionCreatedAt: undefined });
    await this.refreshTokenSvc.revocarTodos(userId);
    this.logger.log(`Super admin forzó logout del usuario #${userId}`);
    return { message: `Sesión del usuario #${userId} cerrada correctamente` };
  }

  /** Genera la respuesta de login completa (token + empresas) para un User */
  async buildLoginResponse(user: User) {
    await this.initNewSession(user);
    const empresaId   = await this.getEmpresaPrincipal(user.id);
    const accessToken = this.buildToken(user, empresaId);
    const empresas    = await this.ueRepository.find({
      where: { userId: user.id, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });
    return {
      accessToken,
      empresaActual: empresaId ?? null,
      empresas: empresas.map(e => ({
        empresaId:   e.empresaId,
        nombre:      e.empresa?.nombre,
        rnc:         e.empresa?.rnc,
        rol:         e.rol,
        isPrincipal: e.isPrincipal,
      })),
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
    };
  }
}
