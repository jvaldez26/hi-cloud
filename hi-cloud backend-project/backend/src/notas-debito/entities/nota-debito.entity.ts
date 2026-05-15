import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { NotaDebitoDetalle } from './nota-debito-detalle.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoNotaDebito {
  BORRADOR = 'borrador',
  EMITIDA  = 'emitida',
  ANULADA  = 'anulada',
}

export enum MotivoNotaDebito {
  CARGO_ADICIONAL   = 'cargo_adicional',
  AJUSTE_PRECIO     = 'ajuste_precio',
  INTERESES         = 'intereses',
  FLETE_ADICIONAL   = 'flete_adicional',
  DIFERENCIA_CAMBIO = 'diferencia_cambio',
  OTRO              = 'otro',
}

@TenantScoped()
@Entity('notas_debito')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'estado'])
@Index(['empresaId', 'clienteId'])
export class NotaDebito extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 10, default: 'E33' })
  tipoNcf!: string;

  @Column({ nullable: true })
  facturaOriginalId?: number;

  @Column({ length: 20, nullable: true })
  facturaOriginalFolio?: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'enum', enum: MotivoNotaDebito, default: MotivoNotaDebito.CARGO_ADICIONAL })
  motivo!: MotivoNotaDebito;

  @Column({ type: 'text', nullable: true })
  descripcionMotivo?: string;

  @OneToMany(() => NotaDebitoDetalle, d => d.notaDebito, { cascade: true, eager: true })
  detalles!: NotaDebitoDetalle[];

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  iva!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'enum', enum: EstadoNotaDebito, default: EstadoNotaDebito.BORRADOR })
  estado!: EstadoNotaDebito;

  @Column({ nullable: true })
  vendedorId?: number;

  @Column({ length: 150, nullable: true })
  nombreVendedor?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
