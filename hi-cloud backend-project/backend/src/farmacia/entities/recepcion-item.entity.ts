import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('fa_recepcion_items')
export class RecepcionItem {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() recepcionId!: number;
  @Column() medicamentoId!: number;
  @Column({ length: 100 }) numeroLote!: string;
  @Column({ type: 'date' }) fechaVencimiento!: string;
  @Column({ type: 'int', nullable: true }) cantidadOrdenada!: number | null;
  @Column() cantidadRecibida!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioCompra!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioVenta!: number | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) subtotal!: number | null;
}
