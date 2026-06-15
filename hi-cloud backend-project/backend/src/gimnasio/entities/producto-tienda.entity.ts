import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('gm_productos_tienda')
export class ProductoTienda {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ length: 50, nullable: true }) categoria?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precio!: number;
  @Column({ default: 0 }) stock!: number;
  @Column({ length: 500, nullable: true }) imagenUrl?: string;
  @Column({ nullable: true }) productoId?: number;
  @Column({ default: true }) isActive!: boolean;
}
