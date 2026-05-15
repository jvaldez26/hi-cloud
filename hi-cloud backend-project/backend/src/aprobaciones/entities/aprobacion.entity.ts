import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoAprobacion {
  PENDIENTE = 'pendiente',
  APROBADO  = 'aprobado',
  RECHAZADO = 'rechazado',
}

export enum TipoAprobacion {
  COTIZACION  = 'cotizacion',
  PRE_FACTURA = 'pre_factura',
  COMPRA      = 'compra',
  GASTO       = 'gasto',
  NOTA_DEBITO = 'nota_debito',
  OTRO        = 'otro',
}

@TenantScoped()
@Entity('aprobaciones')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'solicitadoPorId'])
export class Aprobacion extends TenantBaseEntity {
  @Column({ type: 'enum', enum: TipoAprobacion })
  tipo!: TipoAprobacion;

  @Column()
  entidadId!: number;

  @Column({ length: 50, nullable: true })
  entidadRef?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  monto?: number;

  @Column({ type: 'enum', enum: EstadoAprobacion, default: EstadoAprobacion.PENDIENTE })
  estado!: EstadoAprobacion;

  @Column()
  solicitadoPorId!: number;

  @Column({ length: 150, nullable: true })
  nombreSolicitante?: string;

  @Column({ nullable: true })
  aprobadoPorId?: number;

  @Column({ length: 150, nullable: true })
  nombreAprobador?: string;

  @Column({ type: 'text', nullable: true })
  comentarioSolicitud?: string;

  @Column({ type: 'text', nullable: true })
  comentarioResolucion?: string;

  @Column({ type: 'timestamp', nullable: true })
  fechaResolucion?: Date;
}
