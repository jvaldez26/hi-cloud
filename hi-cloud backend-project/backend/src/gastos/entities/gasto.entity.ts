import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum CategoriaGasto {
  ALQUILER        = 'alquiler',
  SERVICIOS_PUBLI = 'servicios_publicos',
  COMUNICACIONES  = 'comunicaciones',
  NOMINA          = 'nomina',
  MATERIALES      = 'materiales_oficina',
  TRANSPORTE      = 'transporte',
  MARKETING       = 'marketing',
  IMPUESTOS       = 'impuestos_tasas',
  MANTENIMIENTO   = 'mantenimiento',
  SEGUROS         = 'seguros',
  FINANCIEROS     = 'gastos_financieros',
  GASTO_MENOR     = 'gasto_menor',
  OTROS           = 'otros',
}

export const CATEGORIA_LABELS: Record<CategoriaGasto, { label: string; cuenta: string; emoji: string; generaE43?: boolean }> = {
  [CategoriaGasto.ALQUILER]:        { label: 'Alquiler de local',            cuenta: '6.1.2.01', emoji: '🏠' },
  [CategoriaGasto.SERVICIOS_PUBLI]: { label: 'Servicios públicos',           cuenta: '6.1.2.02', emoji: '💡' },
  [CategoriaGasto.COMUNICACIONES]:  { label: 'Comunicaciones',               cuenta: '6.1.2.03', emoji: '📱' },
  [CategoriaGasto.NOMINA]:          { label: 'Sueldos y salarios',           cuenta: '6.1.1.01', emoji: '👥' },
  [CategoriaGasto.MATERIALES]:      { label: 'Materiales de oficina',        cuenta: '6.1.2.04', emoji: '📋' },
  [CategoriaGasto.TRANSPORTE]:      { label: 'Transporte',                   cuenta: '6.1.2.05', emoji: '🚗' },
  [CategoriaGasto.MARKETING]:       { label: 'Marketing y publicidad',       cuenta: '6.1.2.06', emoji: '📢' },
  [CategoriaGasto.IMPUESTOS]:       { label: 'Impuestos y tasas',            cuenta: '6.1.4.01', emoji: '🏛️' },
  [CategoriaGasto.MANTENIMIENTO]:   { label: 'Mantenimiento',                cuenta: '6.1.2.07', emoji: '🔧' },
  [CategoriaGasto.SEGUROS]:         { label: 'Seguros',                      cuenta: '6.1.2.08', emoji: '🛡️' },
  [CategoriaGasto.FINANCIEROS]:     { label: 'Gastos financieros',           cuenta: '6.1.3.01', emoji: '🏦' },
  [CategoriaGasto.GASTO_MENOR]:     { label: 'Gasto menor',                  cuenta: '6.1.2.10', emoji: '🪙', generaE43: true },
  [CategoriaGasto.OTROS]:           { label: 'Otros gastos',                 cuenta: '6.1.2.09', emoji: '📦' },
};

@Entity('gastos')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'periodo'])
export class Gasto extends TenantBaseEntity {
  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'enum', enum: CategoriaGasto })
  categoria!: CategoriaGasto;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  itbis!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;

  @Column({ length: 200, nullable: true })
  proveedor?: string;

  @Column({ length: 50, nullable: true })
  comprobante?: string;

  @Column({ length: 11, nullable: true })
  rncProveedor?: string;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ nullable: true })
  asientoId?: number;

  @Column()
  userId!: number;
}
