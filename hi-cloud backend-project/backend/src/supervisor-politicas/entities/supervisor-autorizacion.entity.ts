import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Autorización de un solo uso para políticas en modo 'cada_vez' — a
 * diferencia de la sesión de 8h (pos_supervisor_log), este token vale para
 * UNA sola llamada, ligado a empresa+cajero+clave, y expira a los pocos
 * minutos aunque nadie lo use.
 */
@Entity('supervisor_autorizaciones')
@Index(['empresaId', 'cajeroId', 'clave'])
export class SupervisorAutorizacion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column()
  cajeroId!: number;

  @Column()
  supervisorId!: number;

  @Column({ length: 60 })
  clave!: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  token!: string;

  @Column({ default: false })
  usado!: boolean;

  @Column({ type: 'timestamptz' })
  expiraEn!: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}
