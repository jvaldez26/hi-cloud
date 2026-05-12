import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum TierPrecio {
  MAYORISTA   = 'mayorista',
  MINORISTA   = 'minorista',
  VIP         = 'vip',
  ESPECIAL    = 'especial',
  DISTRIBUIDOR= 'distribuidor',
}

@Entity('precios_especiales')
export class PrecioEspecial {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Index()
  @Column()
  productoId!: number;

  @Index()
  @Column({ nullable: true })
  clienteId?: number;

  @Column({ type: 'enum', enum: TierPrecio, nullable: true })
  tier?: TierPrecio;

  @Column({ length: 200, nullable: true })
  nombre?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  precioFijo?: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  descuentoPorcentaje?: number;

  @Column({ type: 'date', nullable: true })
  vigenciaDesde?: Date;

  @Column({ type: 'date', nullable: true })
  vigenciaHasta?: Date;

  @Column({ default: true })
  isActive!: boolean;

  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
