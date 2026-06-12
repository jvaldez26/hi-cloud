import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('fa_dispensacion_items')
export class DispensacionItem {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() dispensacionId!: number;
  @Column() medicamentoId!: number;
  @Column({ type: 'int', nullable: true }) loteId!: number | null;
  @Column({ type: 'decimal', precision: 8, scale: 2 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precioUnitario!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) total!: number | null;
  @Column({ type: 'text', nullable: true }) instrucciones!: string | null;
  @Column({ default: false }) requeriReceta!: boolean;
  @Column({ default: false }) recetaVerificada!: boolean;
}
