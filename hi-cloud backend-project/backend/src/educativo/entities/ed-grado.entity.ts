import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_grados')
export class EdGrado {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) nivelId?: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ default: 0 }) orden!: number;
  @Column({ default: true }) isActive!: boolean;
}
