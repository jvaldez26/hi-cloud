import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_labores')
export class AgLabor {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() cicloId!: number;
  @Column({ type: 'int', nullable: true }) parcelaId?: number;
  @Column({ length: 50 }) tipo!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'int', nullable: true }) cantidadTrabajadores?: number;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) horasTrabajadas?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoManoObra!: number;
  @Column({ length: 100, nullable: true }) usoMaquinaria?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) costoMaquinaria!: number;
  @Column({ length: 20, default: 'completada' }) estado!: string;
  @Column({ length: 200, nullable: true }) responsable?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
