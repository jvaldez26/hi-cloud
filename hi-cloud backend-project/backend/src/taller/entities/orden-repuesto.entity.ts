import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tm_orden_repuestos')
export class OrdenRepuesto {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() ordenId!: number;
  @Column({ type: 'int', nullable: true }) productoId!: number | null;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) referencia!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) marca!: string | null;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costoUnitario!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioUnitario!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total!: number;
  @Column({ length: 30, default: 'inventario' }) origen!: string;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
