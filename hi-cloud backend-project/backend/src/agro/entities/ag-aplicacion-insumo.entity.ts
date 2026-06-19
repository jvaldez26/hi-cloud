import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_aplicaciones_insumo')
export class AgAplicacionInsumo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() cicloId!: number;
  @Column({ type: 'int', nullable: true }) laborId?: number;
  @Column({ type: 'int', nullable: true }) productoId?: number;
  @Column({ length: 200 }) insumoNombre!: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) cantidad!: number;
  @Column({ length: 30, nullable: true }) unidad?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costoUnitario?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) costoTotal?: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 50, nullable: true }) dosisPorArea?: string;
  @Column({ length: 50, nullable: true }) metodoAplicacion?: string;
  @Column({ length: 100, nullable: true }) loteInsumo?: string;
  @Column({ type: 'int', nullable: true }) periodoCarencia?: number;
  @Column({ length: 200, nullable: true }) responsable?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
