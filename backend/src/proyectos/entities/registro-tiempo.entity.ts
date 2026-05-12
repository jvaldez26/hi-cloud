import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Proyecto } from './proyecto.entity';
import { User } from '../../users/users.entity';

@Entity('proyecto_tiempos')
export class RegistroTiempo extends BaseEntity {
  @Column()
  proyectoId!: number;

  @ManyToOne(() => Proyecto, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'proyectoId' })
  proyecto!: Proyecto;

  @Column({ nullable: true })
  tareaId?: number;

  @Column()
  usuarioId!: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario!: User;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  horas!: number;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ default: false })
  facturado!: boolean;
}
