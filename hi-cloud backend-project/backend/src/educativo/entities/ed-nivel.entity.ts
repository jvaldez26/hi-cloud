import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_niveles')
export class EdNivel {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ default: 0 }) orden!: number;
  @Column({ default: true }) isActive!: boolean;
}
