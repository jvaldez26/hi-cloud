import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_comedor_planes')
export class EdComedorPlan {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() estudianteId!: number;
  @Column({ length: 30, nullable: true }) tipo?: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) costoMensual?: number;
  @Column({ type: 'text', nullable: true }) restriccionesAlimenticias?: string;
  @Column({ default: true }) isActive!: boolean;
}
