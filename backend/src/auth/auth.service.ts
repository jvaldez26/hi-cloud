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
import { randomUUID } from 'crypto';
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

      return {
        message: 'Usuario registrado exitosamente',
        user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role },
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
      user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role },
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

    const user = await this.userRepository.findOneByOrFail({ id: userId });
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

    const resetUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/restablecer/${token}`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
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
      resetPasswordToken:   undefined,
      resetPasswordExpires: undefined,
    });

    this.logger.log(`Contraseña restablecida para usuario #${user.id}`);
    return { message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' };
  }
}
