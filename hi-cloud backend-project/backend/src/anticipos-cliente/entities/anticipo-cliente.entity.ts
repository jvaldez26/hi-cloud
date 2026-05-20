import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoAnticipo {
  ACTIVO   = 'activo',
  APLICADO = 'aplicado',
  ANULADO  = 'anulado',
}

@TenantScoped()
@Entity('anticipo_cliente')
@Index(['empresaId', 'clienteId'])
@Index(['empresaId', 'estado'])
export class AnticipoCliente extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column()
  clienteId!: number;

  @Column({ length: 200, nullable: true })
  clienteNombre?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  montoPendiente!: number;

  @Column({ length: 30 })
  tipoPago!: string;

  @Column({ length: 100, nullable: true })
  referencia?: string;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({
    type: 'enum',
    enum: EstadoAnticipo,
    default: EstadoAnticipo.ACTIVO,
  })
  estado!: EstadoAnticipo;

  @Column({ type: 'date' })
  fechaRegistro!: string;

  @Column({ nullable: true })
  cajaDiariaId?: number;

  @Column({ nullable: true })
  asientoId?: number;

  @Column()
  usuarioId!: number;

  @Column({ length: 150, nullable: true })
  nombreUsuario?: string;
}
