import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_consultas')
export class Consulta {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero!: string | null;
  @Column() pacienteId!: number;
  @Column() medicoId!: number;
  @Column({ type: 'int', nullable: true }) citaId!: number | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ length: 50, nullable: true }) tipoCita!: string | null;
  @Column({ type: 'text' }) motivoConsulta!: string;
  @Column({ type: 'text', nullable: true }) enfermedadActual!: string | null;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) temperatura!: number | null;
  @Column({ type: 'int', nullable: true }) presionSistolica!: number | null;
  @Column({ type: 'int', nullable: true }) presionDiastolica!: number | null;
  @Column({ type: 'int', nullable: true }) frecuenciaCardiaca!: number | null;
  @Column({ type: 'int', nullable: true }) frecuenciaRespiratoria!: number | null;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) saturacionOxigeno!: number | null;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) peso!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) talla!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) imc!: number | null;
  @Column({ type: 'text', nullable: true }) examenFisico!: string | null;
  @Column({ type: 'text', nullable: true }) diagnosticoPrincipal!: string | null;
  @Column({ length: 500, nullable: true }) diagnosticosCIE10!: string | null;
  @Column({ type: 'text', nullable: true }) diagnosticosDescripcion!: string | null;
  @Column({ type: 'text', nullable: true }) planTratamiento!: string | null;
  @Column({ type: 'text', nullable: true }) indicaciones!: string | null;
  @Column({ type: 'date', nullable: true }) proximaCita!: string | null;
  @Column({ type: 'text', nullable: true }) proximaCitaMotivo!: string | null;
  @Column({ default: false }) recetaGenerada!: boolean;
  @Column({ default: false }) ordenLaboratorioGenerada!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
