import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_alertas')
export class AlertaFarmacia {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 30, nullable: true }) tipo!: string | null;
  @Column({ type: 'int', nullable: true }) medicamentoId!: number | null;
  @Column({ type: 'int', nullable: true }) loteId!: number | null;
  @Column({ type: 'text', nullable: true }) mensaje!: string | null;
  @Column({ type: 'int', nullable: true }) diasRestantes!: number | null;
  @Column({ default: false }) resuelta!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
