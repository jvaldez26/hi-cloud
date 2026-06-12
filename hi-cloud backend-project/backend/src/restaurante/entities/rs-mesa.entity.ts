import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_mesas')
export class RsMesa {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) areaId: number;
  @Column() numero: string;
  @Column({ nullable: true }) nombre: string;
  @Column({ default: 4 }) capacidad: number;
  @Column({ default: 0 }) posicionX: number;
  @Column({ default: 0 }) posicionY: number;
  @Column({ default: 'cuadrada' }) forma: string;
  @Column({ default: 'disponible' }) estado: string;
  @Column({ nullable: true }) comandaActualId: number;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
