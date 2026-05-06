import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { User } from '../../users/users.entity';

export enum EstadoLead {
  NUEVO         = 'nuevo',
  CONTACTADO    = 'contactado',
  CALIFICADO    = 'calificado',
  NO_CALIFICADO = 'no_calificado',
  CONVERTIDO    = 'convertido',
}

export enum FuenteLead {
  WEB            = 'web',
  REFERIDO       = 'referido',
  LLAMADA        = 'llamada',
  EVENTO         = 'evento',
  REDES_SOCIALES = 'redes_sociales',
  EMAIL          = 'email',
  OTRO           = 'otro',
}

@Entity('crm_leads')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Lead extends TenantBaseEntity {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  empresa?: string;

  @Column({ nullable: true })
  cargo?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ type: 'enum', enum: FuenteLead, default: FuenteLead.WEB })
  fuente!: FuenteLead;

  @Column({ type: 'enum', enum: EstadoLead, default: EstadoLead.NUEVO })
  estado!: EstadoLead;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  valorEstimado?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @Column({ nullable: true })
  responsableId?: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User;

  @Column({ nullable: true })
  clienteConvertidoId?: number;
}
