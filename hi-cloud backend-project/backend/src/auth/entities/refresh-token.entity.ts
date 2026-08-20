import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: number;

  @Column({ length: 64 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @Column({ length: 10, nullable: true })
  motivoRevocacion?: 'rotacion' | 'logout' | 'seguridad';

  @Column({ length: 36, nullable: true })
  nextTokenId?: string;

  @Column({ length: 255, nullable: true })
  deviceInfo?: string;

  @Column({ length: 45, nullable: true })
  ipAddress?: string;

  @CreateDateColumn()
  createdAt!: Date;

  /** Última vez que se actualizó la actividad de esta sesión (throttle 5 min desde TenantMiddleware). */
  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt?: Date;
}
