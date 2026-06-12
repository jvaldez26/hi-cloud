import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_signos_vitales')
export class SignosVitales {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() pacienteId!: number;
  @Column({ type: 'int', nullable: true }) consultaId!: number | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) temperatura!: number | null;
  @Column({ type: 'int', nullable: true }) presionSistolica!: number | null;
  @Column({ type: 'int', nullable: true }) presionDiastolica!: number | null;
  @Column({ type: 'int', nullable: true }) frecuenciaCardiaca!: number | null;
  @Column({ type: 'int', nullable: true }) frecuenciaRespiratoria!: number | null;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) saturacionOxigeno!: number | null;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) peso!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) talla!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) imc!: number | null;
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true }) glucosa!: number | null;
  @Column({ length: 100, nullable: true }) registradoPor!: string | null;
}
