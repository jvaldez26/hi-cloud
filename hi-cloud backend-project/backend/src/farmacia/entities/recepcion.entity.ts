import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_recepciones')
export class Recepcion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero!: string | null;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'int', nullable: true }) proveedorId!: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) facturaProveedor!: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotal!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) itbis!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total!: number;
  @Column({ type: 'int', nullable: true }) compraId!: number | null;
  @Column({ length: 20, default: 'recibida' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
