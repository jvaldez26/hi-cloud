import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { ECF } from './ecf.entity';

export enum TipoEcfEvento {
  CREADO             = 'CREADO',
  ENVIADO            = 'ENVIADO',
  RESPUESTA_RECIBIDA = 'RESPUESTA_RECIBIDA',
  REINTENTO          = 'REINTENTO',
  ERROR              = 'ERROR',
  ESTADO_CAMBIADO    = 'ESTADO_CAMBIADO',
}

/** Auditoría de cada cambio de estado / intento de envío de un e-CF. */
@Entity('ecf_eventos')
@Index(['comprobanteId'])
export class EcfEvento {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  comprobanteId!: number;

  @ManyToOne(() => ECF, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobanteId' })
  comprobante!: ECF;

  @Column({ type: 'enum', enum: TipoEcfEvento })
  evento!: TipoEcfEvento;

  /** Payload completo del evento: request enviado, respuesta recibida, etc. */
  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  mensaje?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
