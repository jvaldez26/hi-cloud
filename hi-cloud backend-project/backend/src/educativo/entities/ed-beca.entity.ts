import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_becas')
export class EdBeca {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 150 }) nombre!: string;
  @Column({ length: 30, nullable: true }) tipo?: string;          // 'porcentaje' | 'monto_fijo'
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) valor?: number;
  @Column({ length: 50, nullable: true }) aplicaA?: string;       // 'colegiatura' | 'inscripcion' | 'ambos'
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ default: true }) isActive!: boolean;
}
