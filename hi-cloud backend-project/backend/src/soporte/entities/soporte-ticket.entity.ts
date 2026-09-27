import { Entity, Column } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum AsuntoSoporte {
  ERROR_TECNICO      = 'error_tecnico',
  DUDA_USO           = 'duda_uso',
  SOLICITUD_FUNCION  = 'solicitud_funcion',
  FACTURACION        = 'facturacion',
  CERTIFICACION_DGII = 'certificacion_dgii',
  OTRO               = 'otro',
}

export enum EstadoTicketSoporte {
  ABIERTO    = 'abierto',
  EN_PROCESO = 'en_proceso',
  RESUELTO   = 'resuelto',
  CERRADO    = 'cerrado',
}

export enum PrioridadTicketSoporte {
  BAJA  = 'baja',
  MEDIA = 'media',
  ALTA  = 'alta',
}

/**
 * Ticket de soporte de un usuario autenticado hacia Super Admin — no
 * confundir con el formulario público `contacto-soporte` (sin login, en
 * auth.controller.ts) ni con los "Mensajes a clientes" del Super Admin
 * (mensajes.entity — dirección contraria).
 */
@TenantScoped()
@Entity('soporte_tickets')
export class SoporteTicket extends TenantBaseEntity {
  @Column()
  usuarioId!: number;

  @Column({ type: 'enum', enum: AsuntoSoporte })
  asunto!: AsuntoSoporte;

  @Column({ type: 'text' })
  mensaje!: string;

  @Column({ type: 'enum', enum: EstadoTicketSoporte, default: EstadoTicketSoporte.ABIERTO })
  estado!: EstadoTicketSoporte;

  /** El usuario NO la elige — la asigna un admin al revisar el ticket. */
  @Column({ type: 'enum', enum: PrioridadTicketSoporte, nullable: true })
  prioridad?: PrioridadTicketSoporte;

  /**
   * Snapshot del momento de creación — para que el Super Admin vea de un
   * vistazo desde dónde salió el reporte sin tener que preguntarlo.
   * empresaId/sucursalId/rol/usuarioNombre/usuarioEmail se completan
   * SERVER-SIDE (no se confía en lo que mande el cliente); url/navegador/
   * buildId solo los conoce el cliente y llegan en el DTO tal cual.
   */
  @Column({ type: 'jsonb' })
  contextoAutomatico!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  respuestaAdmin?: string;

  @Column({ nullable: true })
  respondidoPor?: number;

  @Column({ type: 'timestamptz', nullable: true })
  respondidoEn?: Date;
}
