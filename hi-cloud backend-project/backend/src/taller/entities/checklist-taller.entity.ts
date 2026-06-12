import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_checklist')
export class ChecklistTaller {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ unique: true }) ordenId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) motorAceite!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) motorRefrigerante!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) motorCorreas!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) motorFiltroAire!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) motorBujias!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) frenosPastillas!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) frenosDiscos!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) frenosLiquido!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) frenosMano!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) suspensionAmortiguadores!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) suspensionBrazos!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) suspensionBujes!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) llantaDelanteraIzq!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) llantaDelanteraDer!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) llantaTraseraIzq!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) llantaTraseraDer!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) llantaRepuesto!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) electricoBateria!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) electricoAlternador!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) electricoLuces!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) acFuncionamiento!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) acGas!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) acFiltro!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) limpiaparabrisas!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) nivelLiquidos!: string | null;
  @Column({ type: 'text', nullable: true }) observaciones!: string | null;
  @Column({ type: 'int', nullable: true }) inspeccionadoPor!: number | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fechaInspeccion!: Date;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
