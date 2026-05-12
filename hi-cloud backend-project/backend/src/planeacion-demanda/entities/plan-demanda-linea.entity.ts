import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { PlanDemanda } from './plan-demanda.entity';
import { Producto } from '../../productos/entities/producto.entity';

export enum TendenciaProducto {
  CRECIENTE   = 'creciente',
  ESTABLE     = 'estable',
  DECRECIENTE = 'decreciente',
  SIN_DATOS   = 'sin_datos',
}

@Entity('plan_demanda_lineas')
export class PlanDemandaLinea extends TenantBaseEntity {
  @ManyToOne(() => PlanDemanda, (p) => p.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan!: PlanDemanda;

  @Column()
  planId!: number;

  @ManyToOne(() => Producto, { eager: true })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;

  @Column()
  productoId!: number;

  // ── Histórico ─────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  ventaPromedio3m!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  ventaPromedio6m!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  ventaPromedio12m!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  ventaMaximaMensual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  ventaMinimaMensual!: number;

  @Column({ type: 'enum', enum: TendenciaProducto, default: TendenciaProducto.SIN_DATOS })
  tendencia!: TendenciaProducto;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  coeficienteVariacion!: number;   // % — mide estabilidad de la demanda

  // ── Proyección (próximos N meses) ─────────────────────────────────────────
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  proyeccionMes1!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  proyeccionMes2!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  proyeccionMes3!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  proyeccionTotal!: number;

  // ── Stock y abastecimiento ─────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockActual!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  stockMinimo!: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  cantidadSugeridaCompra!: number;

  @Column({ default: false })
  requiereCompra!: boolean;

  // ── JSON con datos mensuales para gráficas ─────────────────────────────────
  @Column({ type: 'text', nullable: true })
  historicoMensual?: string;   // JSON: [{mes, cantidad, monto}]
}
