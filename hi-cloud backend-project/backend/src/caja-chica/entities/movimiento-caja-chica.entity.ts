import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum TipoMovCajaChica {
  APERTURA    = 'apertura',
  EGRESO      = 'egreso',
  REPOSICION  = 'reposicion',
  AJUSTE      = 'ajuste',
  CIERRE      = 'cierre',
}

export const CATEGORIAS_CAJA: Record<string, { label: string; emoji: string }> = {
  materiales:    { label: 'Materiales y útiles',    emoji: '📦' },
  transporte:    { label: 'Transporte y gasolina',  emoji: '🚗' },
  alimentacion:  { label: 'Alimentación',            emoji: '🍽️' },
  comunicacion:  { label: 'Comunicación',            emoji: '📱' },
  limpieza:      { label: 'Limpieza',                emoji: '🧹' },
  mensajeria:    { label: 'Mensajería',              emoji: '📬' },
  reparacion:    { label: 'Reparaciones menores',    emoji: '🔧' },
  impuestos:     { label: 'Impuestos y tasas',       emoji: '🏛️' },
  otros:         { label: 'Otros',                   emoji: '📋' },
};

@Entity('movimientos_caja_chica')
@Index(['empresaId', 'cajaChicaId'])
@Index(['empresaId', 'createdAt'])
export class MovimientoCajaChica extends TenantBaseEntity {
  @Column()
  cajaChicaId!: number;

  @Column({ type: 'enum', enum: TipoMovCajaChica })
  tipo!: TipoMovCajaChica;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ length: 50, nullable: true })
  categoria?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saldoAnterior!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  saldoNuevo!: number;

  @Column({ length: 60, nullable: true })
  comprobante?: string;

  @Column({ length: 150, nullable: true })
  beneficiario?: string;

  @Column()
  userId!: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
