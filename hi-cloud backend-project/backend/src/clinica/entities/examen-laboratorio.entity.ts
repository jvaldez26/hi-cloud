import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_examenes_laboratorio')
export class ExamenLaboratorio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() ordenId!: number;
  @Column({ length: 200 }) examen!: string;
  @Column({ length: 100, nullable: true }) categoria!: string | null;
  @Column({ type: 'text', nullable: true }) resultado!: string | null;
  @Column({ length: 50, nullable: true }) unidad!: string | null;
  @Column({ length: 100, nullable: true }) valorReferencia!: string | null;
  @Column({ length: 20, default: 'pendiente' }) estado!: string;
}
