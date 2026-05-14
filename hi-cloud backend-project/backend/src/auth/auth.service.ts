import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { EmailService } from '../notificaciones/services/email.service';
import { User } from '../users/users.entity';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService:  UsersService,
    private jwtService:    JwtService,
    private emailService:  EmailService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UsuarioEmpresa)
    private ueRepository: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
  ) {}

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
    return this.jwtService.sign({
      sub:       user.id,
      email:     user.email,
      role:      user.role,
      empresaId: empresaId ?? null,
    });
  }

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    this.logger.log(`[REGISTER] nombre="${dto.nombre}" (${dto.nombre?.length ?? 0} chars) | email="${dto.email}"`);

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('El email ya está registrado');

    const hashed = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.usersService.createFull({
        nombre:   dto.nombre,
        email:    dto.email,
        password: hashed,
      });

      // Enviar correo de verificación en background (no bloquea la respuesta)
      this.sendVerificationEmail(user.id, user.email, user.nombre).catch(err =>
        this.logger.warn(`No se pudo enviar verificación a ${user.email}: ${err?.message}`),
      );

      return {
        message: 'Usuario registrado. Revisa tu correo para verificar tu cuenta.',
        user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, tourCompletado: (user as any).tourCompletado ?? false },
      };
    } catch {
      throw new InternalServerErrorException('Error al crear el usuario');
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new UnauthorizedException('Credenciales inválidas');

    // Bloquear solo usuarios registrados DESPUÉS de implementar la verificación
    // Usuarios anteriores a 2026-05-12 son válidos aunque no tengan emailVerifiedAt
    const FECHA_IMPL_VERIFICACION = new Date('2026-05-12T00:00:00Z');
    const esNuevo = user.createdAt > FECHA_IMPL_VERIFICACION;
    if (esNuevo && !(user as any).emailVerifiedAt) {
      throw new UnauthorizedException('CORREO_NO_VERIFICADO');
    }

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
    // Admin global puede cambiar a cualquier empresa
    if (userRole !== UserRole.ADMIN) {
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
      select: ['id', 'emailVerifiedAt', 'emailVerificationExpires', 'isActive'] as any,
    });

    if (!user) throw new BadRequestException('Token inválido o expirado');

    if ((user as any).emailVerifiedAt) {
      return { message: 'Tu correo ya fue verificado. Ya puedes iniciar sesión.' };
    }

    const expires: Date | undefined = (user as any).emailVerificationExpires;
    if (expires && expires < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita un nuevo correo de verificación.');
    }

    await this.userRepository.update(user.id, {
      emailVerifiedAt:          new Date(),
      emailVerificationToken:   null,
      emailVerificationExpires: null,
    } as any);

    this.logger.log(`Email verificado para usuario #${user.id}`);
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
      await this.userRepository.update(user.id, {
        googleId: data.googleId,
        provider: 'GOOGLE',
      } as any);
      return { ...user, googleId: data.googleId } as User;
    }

    // 3. Crear cuenta nueva (sin contraseña usable)
    const pw = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const newUser = this.userRepository.create({
      nombre:         data.nombre,
      email:          data.email,
      password:       pw,
      googleId:       data.googleId,
      provider:       'GOOGLE',
      emailVerifiedAt: new Date(),  // Google ya verificó el email
    } as any);
    return this.userRepository.save(newUser) as unknown as User;
  }

  async marcarTourCompletado(userId: number): Promise<void> {
    await this.userRepository.update(userId, { tourCompletado: true } as any);
  }

  /** Genera la respuesta de login completa (token + empresas) para un User */
  async buildLoginResponse(user: User) {
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
