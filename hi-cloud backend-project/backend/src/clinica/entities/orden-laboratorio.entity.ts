import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_ordenes_laboratorio')
export class OrdenLaboratorio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero!: string | null;
  @Column() pacienteId!: number;
  @Column() medicoId!: number;
  @Column({ type: 'int', nullable: true }) consultaId!: number | null;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ default: false }) urgente!: boolean;
  @Column({ type: 'text', nullable: true }) diagnosticoPresuntivo!: string | null;
  @Column({ type: 'text', nullable: true }) indicaciones!: string | null;
  @Column({ length: 20, default: 'pendiente' }) estado!: string;
  @Column({ type: 'date', nullable: true }) fechaResultados!: string | null;
  @Column({ length: 100, nullable: true }) laboratorioNombre!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
