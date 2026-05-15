import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../common/entities/tenant-base.entity';
import { TenantScoped } from '../tenant/decorators/tenant-scoped.decorator';

export enum EstadoTicket {
  ABIERTO    = 'abierto',
  EN_PROCESO = 'en_proceso',
  RESUELTO   = 'resuelto',
  CERRADO    = 'cerrado',
}

export enum PrioridadTicket {
  BAJA  = 'baja',
  MEDIA = 'media',
  ALTA  = 'alta',
}

export enum CategoriaTicket {
  SOPORTE_TECNICO = 'soporte_tecnico',
  FACTURACION     = 'facturacion',
  DEVOLUCION      = 'devolucion',
  CONSULTA        = 'consulta',
  OTRO            = 'otro',
}

@TenantScoped()
@Entity('tickets_soporte')
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class TicketSoporte extends TenantBaseEntity {
  @Column()
  clienteId!: number;

  @Column({ length: 100, nullable: true })
  clienteNombre?: string;

  @Column({ length: 64 })
  portalToken!: string;

  @Column({ length: 200 })
  asunto!: string;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'enum', enum: CategoriaTicket, default: CategoriaTicket.OTRO })
  categoria!: CategoriaTicket;

  @Column({ type: 'enum', enum: PrioridadTicket, default: PrioridadTicket.MEDIA })
  prioridad!: PrioridadTicket;

  @Column({ type: 'enum', enum: EstadoTicket, default: EstadoTicket.ABIERTO })
  estado!: EstadoTicket;

  @Column({ type: 'text', nullable: true })
  respuesta?: string;

  @Column({ type: 'timestamptz', nullable: true })
  fechaRespuesta?: Date;

  @Column({ nullable: true })
  asignadoId?: number;   // id del usuario asignado para resolver el ticket
}
