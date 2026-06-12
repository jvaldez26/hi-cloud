import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_lotes')
export class Lote {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() medicamentoId!: number;
  @Column({ length: 100 }) numeroLote!: string;
  @Column({ type: 'date', nullable: true }) fechaFabricacion!: string | null;
  @Column({ type: 'date' }) fechaVencimiento!: string;
  @Column() cantidadInicial!: number;
  @Column() cantidadActual!: number;
  @Column({ type: 'int', nullable: true }) proveedorId!: number | null;
  @Column({ type: 'date', nullable: true }) fechaCompra!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioCompra!: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) facturaCompra!: string | null;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @CreateDateColumn() createdAt!: Date;
}
