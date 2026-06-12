import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tm_diagnosticos')
export class DiagnosticoTaller {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() ordenId!: number;
  @Column({ type: 'int', nullable: true }) tecnicoId!: number | null;
  @Column({ type: 'timestamp' }) fecha!: Date;
  @Column({ type: 'varchar', length: 100, nullable: true }) sistema!: string | null;
  @Column({ type: 'text' }) descripcion!: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) severidad!: string | null;
  @Column({ type: 'text', nullable: true }) recomendacion!: string | null;
  @Column({ default: false }) requiereAtencionInmediata!: boolean;
  @Column({ default: true }) incluidoEnPresupuesto!: boolean;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costoEstimado!: number | null;
  @Column({ type: 'text', nullable: true }) imagenUrl!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
