import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Chequera } from './chequera.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoCheque {
  EN_CARTERA  = 'en_cartera',
  ENTREGADO   = 'entregado',
  COBRADO     = 'cobrado',
  RECHAZADO   = 'rechazado',
  ANULADO     = 'anulado',
  POSFECHADO  = 'posfechado',
}

export enum TipoCheque {
  EMITIDO  = 'emitido',   // cheque que emitimos (pagamos)
  RECIBIDO = 'recibido',  // cheque que nos dieron (cobramos)
}

@TenantScoped()
@Entity('cheques')
@Index(['empresaId', 'isActive'])
export class Cheque extends TenantBaseEntity {
  @Column()
  chequeraId!: number;

  @ManyToOne(() => Chequera, { eager: true })
  @JoinColumn({ name: 'chequeraId' })
  chequera!: Chequera;

  @Column()
  numero!: string;

  @Column({ type: 'enum', enum: TipoCheque, default: TipoCheque.EMITIDO })
  tipo!: TipoCheque;

  @Column({ type: 'enum', enum: EstadoCheque, default: EstadoCheque.EN_CARTERA })
  estado!: EstadoCheque;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'date', nullable: true })
  fechaCobro?: Date;

  @Column({ length: 200 })
  beneficiario!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'text', nullable: true })
  concepto?: string;

  // Vínculo con documento del sistema
  @Column({ nullable: true })
  facturaId?: number;

  @Column({ nullable: true })
  compraId?: number;

  @Column({ length: 100, nullable: true })
  referencia?: string;
}
