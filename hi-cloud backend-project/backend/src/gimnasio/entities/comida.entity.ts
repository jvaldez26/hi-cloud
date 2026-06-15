import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('gm_comidas')
export class Comida {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() planNutricionalId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 10, nullable: true }) hora?: string;
  @Column({ type: 'jsonb', nullable: true }) alimentos?: any;
  @Column({ nullable: true }) caloriasTotal?: number;
  @Column({ default: 0 }) orden!: number;
}
