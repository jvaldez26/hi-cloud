import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cw_turno_lavadores')
export class CwTurnoLavador {
  @PrimaryGeneratedColumn() id!: number;
  @Column() turnoId!: number;
  @Column() lavadorId!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2 }) porcentaje!: number;

  @CreateDateColumn() createdAt!: Date;
}
