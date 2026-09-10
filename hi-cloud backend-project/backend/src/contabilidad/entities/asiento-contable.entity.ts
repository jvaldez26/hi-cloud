import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { AsientoLinea } from './asiento-linea.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoOrigenAsiento {
  MANUAL        = 'manual',
  FACTURA       = 'factura',
  COMPRA        = 'compra',
  COBRO         = 'cobro',
  PAGO          = 'pago',
  AJUSTE        = 'ajuste',
  MANUFACTURA   = 'manufactura',
  PRESTAMISTA   = 'prestamista',
  IMPORTACION   = 'importacion',
  // Asiento propio de una Nota de Crédito aceptada por DGII. Namespace propio
  // (no 'ajuste') para que revertirAsiento() no colisione con gastos, nómina,
  // mantenimiento o devoluciones, que también usan 'ajuste' con su propio
  // espacio de referenciaId — dos documentos de distinta tabla pueden compartir
  // el mismo id numérico (cada tabla tiene su propio auto-increment).
  NOTA_CREDITO  = 'nota_credito',
}

export enum EstadoAsiento {
  BORRADOR       = 'borrador',
  CONTABILIZADO  = 'contabilizado',
  ANULADO        = 'anulado',
}

@TenantScoped()
@Entity('asientos_contables')
export class AsientoContable extends TenantBaseEntity {
  @Column({ length: 20 })
  numero!: string;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'enum', enum: TipoOrigenAsiento, default: TipoOrigenAsiento.MANUAL })
  tipoOrigen!: TipoOrigenAsiento;

  @Column({ nullable: true })
  referenciaId?: number;

  @Column({ length: 50, nullable: true })
  referenciaFolio?: string;

  // Vincula un contra-asiento de reversa con el asiento CONTABILIZADO original
  // que revierte. NULL en el original; apunta al id del original en la reversa.
  // Reversa = contra-asiento NUEVO con débitos/créditos invertidos — el
  // original NUNCA se borra, desactiva ni edita (ver revertirAsiento() en
  // AsientosAutomaticosService). Esta columna es lo que hace idempotente esa
  // función: si ya existe un asiento con asientoRevertidoId = original.id, no
  // se genera otro.
  @Column({ nullable: true })
  asientoRevertidoId?: number;

  @Column({ type: 'enum', enum: EstadoAsiento, default: EstadoAsiento.BORRADOR })
  estado!: EstadoAsiento;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalDebe!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalHaber!: number;

  @OneToMany(() => AsientoLinea, (l) => l.asiento, { cascade: true, eager: true })
  lineas!: AsientoLinea[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
