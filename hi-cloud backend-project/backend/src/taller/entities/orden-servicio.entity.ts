import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tm_orden_servicios')
export class OrdenServicio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() ordenId!: number;
  @Column({ type: 'int', nullable: true }) tecnicoId!: number | null;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) categoria!: string | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) horasEstimadas!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) horasReales!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) tarifaHora!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioUnitario!: number;
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total!: number;
  @Column({ length: 20, default: 'pendiente' }) estado!: string;
  @Column({ type: 'timestamp', nullable: true }) completadoAt!: Date | null;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
