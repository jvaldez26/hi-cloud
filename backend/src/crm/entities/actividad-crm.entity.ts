import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/users.entity';

export enum TipoActividad {
  LLAMADA  = 'llamada',
  EMAIL    = 'email',
  REUNION  = 'reunion',
  NOTA     = 'nota',
  TAREA    = 'tarea',
  DEMO     = 'demo',
}

@Entity('crm_actividades')
export class ActividadCRM extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ type: 'enum', enum: TipoActividad })
  tipo!: TipoActividad;

  @Column()
  descripcion!: string;

  @Column({ type: 'timestamp' })
  fecha!: Date;

  @Column({ default: false })
  completada!: boolean;

  @Column({ nullable: true })
  leadId?: number;

  @Column({ nullable: true })
  oportunidadId?: number;

  @Column({ nullable: true })
  usuarioId?: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario?: User;
}
