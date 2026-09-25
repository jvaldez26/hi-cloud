import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Un fingerprint (dispositivo/navegador) ya visto de un usuario — ver
 * AlertaDispositivoService. `fingerprint` es la identidad real; `ip`/`pais`
 * son solo el último valor visto, informativos para el correo de alerta.
 */
@Entity('dispositivos_conocidos')
@Index(['userId', 'fingerprint'], { unique: true })
export class DispositivoConocido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: number;

  @Column({ length: 64 })
  fingerprint!: string;

  @Column({ length: 45, nullable: true })
  ip?: string;

  @Column({ length: 255, nullable: true })
  userAgent?: string;

  @Column({ length: 2, nullable: true })
  pais?: string;

  @Column({ type: 'timestamptz' })
  primeraVez!: Date;

  @Column({ type: 'timestamptz' })
  ultimaVez!: Date;
}
