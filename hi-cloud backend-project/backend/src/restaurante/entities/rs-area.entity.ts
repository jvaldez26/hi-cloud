import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_areas')
export class RsArea {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() nombre: string;
  @Column({ nullable: true }) descripcion: string;
  @Column({ nullable: true }) capacidadTotal: number;
  @Column({ default: 0 }) orden: number;
  @Column({ default: '#3b82f6' }) color: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
