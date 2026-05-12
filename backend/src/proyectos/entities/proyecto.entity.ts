import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { User } from '../../users/users.entity';

export enum EstadoProyecto {
  PLANIFICACION = 'planificacion',
  ACTIVO        = 'activo',
  EN_PAUSA      = 'en_pausa',
  COMPLETADO    = 'completado',
  CANCELADO     = 'cancelado',
}

export enum TipoFacturacion {
  PRECIO_FIJO = 'precio_fijo',
  POR_HORA    = 'por_hora',
  SIN_COBRO   = 'sin_cobro',
}

@Entity('proyectos')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
export class Proyecto extends TenantBaseEntity {
  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'enum', enum: EstadoProyecto, default: EstadoProyecto.PLANIFICACION })
  estado!: EstadoProyecto;

  @Column({ type: 'enum', enum: TipoFacturacion, default: TipoFacturacion.PRECIO_FIJO })
  tipoFacturacion!: TipoFacturacion;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  presupuesto!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  horasEstimadas!: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  tarifaHora?: number;

  @Column({ nullable: true })
  responsableId?: number;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User;

  @Column({ type: 'int', default: 0 })
  porcentajeAvance!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
