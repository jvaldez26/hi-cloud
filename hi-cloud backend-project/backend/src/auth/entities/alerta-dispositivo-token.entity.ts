import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Token de un solo uso para el enlace "No fui yo" del correo de alerta de
 * dispositivo nuevo — mismo patrón que setup_tokens (solo el hash SHA-256 se
 * guarda, expira a las 24h, `used` lo hace de un solo uso).
 */
@Entity('alerta_dispositivo_tokens')
export class AlertaDispositivoToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: number;

  @Column({ length: 64, unique: true })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ default: false })
  used!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
