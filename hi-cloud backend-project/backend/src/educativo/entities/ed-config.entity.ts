import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_config')
export class EdConfig {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 300, nullable: true }) nombreCentro?: string;
  @Column({ length: 100, nullable: true }) codigoMinerd?: string;
  @Column({ length: 100, nullable: true }) regional?: string;
  @Column({ length: 100, nullable: true }) distritoEducativo?: string;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) escalaMinima!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 }) escalaMaxima!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 70 }) notaMinimaAprobar!: number;
  @Column({ default: false }) usaLetras!: boolean;
  @Column({ type: 'jsonb', nullable: true }) escalaLetras?: any[];
  @Column({ default: 4 }) cantidadPeriodos!: number;
  @Column({ length: 20, default: 'trimestre' }) tipoPeriodo!: string;
  @Column({ length: 10, default: 'DOP' }) monedaColegiatura!: string;
  @CreateDateColumn() createdAt!: Date;
}
