import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/users.entity';

export enum EtapaOportunidad {
  PROSPECTO    = 'prospecto',
  CONTACTADO   = 'contactado',
  PROPUESTA    = 'propuesta',
  NEGOCIACION  = 'negociacion',
  GANADO       = 'ganado',
  PERDIDO      = 'perdido',
}

@Entity('crm_oportunidades')
export class Oportunidad extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  titulo!: string;

  @Column({ nullable: true })
  empresa?: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ nullable: true })
  leadId?: number;

  @Column({ type: 'enum', enum: EtapaOportunidad, default: EtapaOportunidad.PROSPECTO })
  etapa!: EtapaOportunidad;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  valor!: number;

  @Column({ type: 'int', default: 50 })
  probabilidad!: number;

  @Column({ type: 'date', nullable: true })
  fechaCierreEsperada?: Date;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'text', nullable: true })
  motivoPerdida?: string;

  @Column({ nullable: true })
  responsableId?: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User;
}
