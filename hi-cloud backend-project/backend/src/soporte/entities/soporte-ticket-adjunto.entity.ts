import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Imagen adjunta a un ticket de soporte. `ruta` es la KEY de S3 (bucket
 * privado, ver S3Service.uploadKey), nunca una URL — la URL se firma
 * on-demand con TTL corto (ver SoporteAdjuntosService.conUrlFirmada),
 * igual que comprobanteKey en pagos-suscripcion.
 */
@TenantScoped()
@Entity('soporte_ticket_adjuntos')
export class SoporteTicketAdjunto extends TenantBaseEntity {
  @Index()
  @Column()
  ticketId!: number;

  @Column({ type: 'text' })
  ruta!: string;

  @Column({ type: 'varchar', length: 50 })
  tipoMime!: string;

  @Column({ type: 'int' })
  tamanioBytes!: number;
}
