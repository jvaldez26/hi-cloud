import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

export type EstadoSolicitudRemota = 'pendiente' | 'aprobada' | 'rechazada' | 'expirada' | 'cancelada';

/**
 * Solicitud de autorización REMOTA de Modo Supervisor — el cajero la crea
 * desde el POS cuando una acción pide supervisor y no hay nadie presente;
 * un ADMIN/CONTADOR de la misma empresa la aprueba o rechaza desde
 * cualquier dispositivo con su sesión. Ver src/autorizacion-remota/ y el
 * flujo completo en autorizacion-remota.service.ts.
 *
 * Al aprobar, se emite un token de un solo uso en `supervisor_autorizaciones`
 * (origen='remoto') — esta tabla es el historial de la CONVERSACIÓN
 * (quién pidió qué, quién respondió, cuándo), no el mecanismo de
 * autorización en sí.
 */
@Entity('solicitudes_autorizacion_remota')
@Index(['empresaId', 'cajaId', 'estado'])
@Index(['cajeroId', 'createdAt'])
export class SolicitudAutorizacionRemota {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column()
  cajeroId!: number;

  @Column({ length: 150 })
  cajeroNombre!: string;

  @Column({ type: 'int', nullable: true })
  sucursalId?: number | null;

  /** Caja/terminal del POS — null si la política no es específica de caja. */
  @Column({ type: 'int', nullable: true })
  cajaId?: number | null;

  /** Clave del catálogo (ver supervisor-catalogo.ts). */
  @Column({ length: 60 })
  clave!: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado!: EstadoSolicitudRemota;

  /** Motivo escrito por el CAJERO — obligatorio al pedir. */
  @Column({ type: 'text' })
  motivo!: string;

  /** Detalle legible para el supervisor — cliente, carrito resumido, factura
   *  afectada, descuento o precio nuevo. Texto libre: cada pantalla del POS
   *  manda lo que tiene sentido mostrar para esa acción puntual. */
  @Column({ type: 'jsonb', nullable: true })
  detalle?: Record<string, unknown> | null;

  /** Huella de la acción — si se llenan, se copian al token emitido al
   *  aprobar (ver huella-autorizacion-remota.util.ts). */
  @Column({ type: 'int', nullable: true })
  facturaId?: number | null;

  @Column({ type: 'int', nullable: true })
  clienteId?: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  monto?: number | null;

  @Column({ type: 'int', nullable: true })
  supervisorId?: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  supervisorNombre?: string | null;

  /** Comentario opcional del supervisor al aprobar/rechazar. */
  @Column({ type: 'text', nullable: true })
  comentario?: string | null;

  /** Token de un solo uso emitido al aprobar — mismo valor que
   *  supervisor_autorizaciones.token, para poder trazar uno desde el otro. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  token?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  dispositivo?: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondidoEn?: Date | null;

  /** Vence a los 3 minutos sin respuesta. */
  @Column({ type: 'timestamptz' })
  expiraEn!: Date;
}
