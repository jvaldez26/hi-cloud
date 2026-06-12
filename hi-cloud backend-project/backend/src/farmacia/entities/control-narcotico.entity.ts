import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_control_narcoticos')
export class ControlNarcotico {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() medicamentoId!: number;
  @Column({ type: 'int', nullable: true }) loteId!: number | null;
  @Column({ type: 'int', nullable: true }) dispensacionId!: number | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true }) tipo!: string | null;
  @Column({ type: 'decimal', precision: 8, scale: 2 }) cantidad!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) saldoAnterior!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) saldoActual!: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) receptorNombre!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) receptorCedula!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) receptorMedico!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) recetaNumero!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) autorizadoPor!: string | null;
  @Column({ type: 'text', nullable: true }) observaciones!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
