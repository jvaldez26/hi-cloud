import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_asignaturas')
export class EdAsignatura {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 150 }) nombre!: string;
  @Column({ length: 50, nullable: true }) codigo?: string;
  @Column({ length: 100, nullable: true }) area?: string;
  @Column({ default: true }) esEvaluable!: boolean;
  @Column({ default: true }) isActive!: boolean;
}
