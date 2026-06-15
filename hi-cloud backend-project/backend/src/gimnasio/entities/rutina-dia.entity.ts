import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('gm_rutina_dias')
export class RutinaDia {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() rutinaId!: number;
  @Column() numeroDia!: number;
  @Column({ length: 100, nullable: true }) nombre?: string;
  @Column({ length: 100, nullable: true }) grupoMuscular?: string;
  @Column({ default: true }) isActive!: boolean;
}
