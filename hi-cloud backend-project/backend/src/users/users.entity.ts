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
  // sessionToken = UUID incluido en el JWT; si difiere → sesión desplazada
  @Column({ length: 64, nullable: true })
  sessionToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  sessionCreatedAt?: Date;

  @Column({ default: false })
  tourCompletado!: boolean;

  @Column({ default: false })
  twoFactorEnabled!: boolean;

  @Column({ length: 100, nullable: true, select: false })
  twoFactorSecret?: string;
}
