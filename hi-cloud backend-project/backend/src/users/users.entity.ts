import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { UserRole } from './enums/user-role.enum';

export type AuthProvider = 'LOCAL' | 'GOOGLE';

@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @Column({ unique: true, length: 150 })
  email!: string;

  /**
   * Alias de acceso opcional — NO es una identidad nueva. Verificación de
   * cuenta, recuperación de contraseña, notificaciones y Google OAuth siguen
   * colgando exclusivamente de `email`; username solo resuelve a un usuario
   * al iniciar sesión (ver AuthService.login()).
   *
   * Único GLOBALMENTE (no por empresa) y case-insensitive: la garantía real
   * vive en el índice único parcial sobre LOWER(username) de la migración
   * 1763100000000, no aquí — `unique: true` a nivel de columna exigiría
   * coincidencia exacta de mayúsculas, que es justo lo que no queremos.
   * Se guarda siempre en minúsculas (ver SetUsernameDto).
   */
  @Column({ length: 30, nullable: true })
  username?: string;

  @Column({ select: false })
  password!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role!: UserRole;

  // ── Password reset ────────────────────────────────────────────────────────
  @Column({ length: 100, nullable: true, select: false })
  resetPasswordToken?: string;

  @Column({ type: 'timestamp', nullable: true, select: false })
  resetPasswordExpires?: Date;

  // ── Email verification ────────────────────────────────────────────────────
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ length: 255, nullable: true, select: false })
  emailVerificationToken?: string;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  emailVerificationExpires?: Date;

  // ── Auth provider ─────────────────────────────────────────────────────────
  @Column({ length: 20, default: 'LOCAL' })
  provider!: AuthProvider;

  @Column({ length: 100, nullable: true, select: false })
  googleId?: string;

  @Column({ type: 'text', nullable: true, select: false })
  googleAccessToken?: string;

  // ── 2FA ──────────────────────────────────────────────────────────────────
  // ── Role versioning (S-31) ────────────────────────────────────────────────
  // Se incrementa cuando el rol cambia → invalida JWTs con versión anterior
  @Column({ type: 'int', default: 1 })
  roleVersion!: number;

  // ── Session control — una sesión activa por usuario ───────────────────────
  // sessionToken = UUID incluido en el JWT; si difiere → sesión desplazada.
  //
  // select:false porque es un secreto de sesión y NO debe salir al cliente.
  // Sin él, /auth/me y GET /users/:id lo serializaban en la respuesta y el
  // frontend acababa guardándolo en localStorage (auth.store: 'auth_user'),
  // legible por cualquier XSS — justo lo que el JWT en cookie httpOnly evita.
  //
  // Quien lo necesita lo pide explícitamente: findByIdForAuth() y
  // findByEmailForAuth() hacen addSelect. Cualquier otra lectura de User lo
  // recibe como undefined, que es el comportamiento seguro por defecto.
  @Column({ length: 64, nullable: true, select: false })
  sessionToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  sessionCreatedAt?: Date;

  @Column({ default: false })
  tourCompletado!: boolean;

  // ── Control de acceso ─────────────────────────────────────────────────────
  // 'pendiente' = registro recibido, esperando aprobación del Super Admin
  // 'activo'    = aprobado, puede iniciar sesión (default para todos los existentes)
  // 'rechazado' = solicitud denegada
  @Column({ length: 20, default: 'activo' })
  accountStatus!: string;

  // true  = contraseña configurada (todos los usuarios existentes + registro manual)
  // false = usuario Google aprobado que aún no configuró su contraseña vía /setup-password
  @Column({ default: true })
  passwordConfigured!: boolean;

  // ── Preferencias UI (por usuario, cross-device) ───────────────────────────
  @Column({ length: 20, default: 'nube' })
  temaSidebar!: string;

  @Column({ default: false })
  twoFactorEnabled!: boolean;

  @Column({ length: 100, nullable: true, select: false })
  twoFactorSecret?: string;

  // Códigos de respaldo 2FA (hashed con SHA-256, uso único)
  @Column({ type: 'jsonb', nullable: true, select: false })
  twoFactorBackupCodes?: string[];
}
