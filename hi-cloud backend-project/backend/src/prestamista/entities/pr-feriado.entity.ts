import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Motor v2 (Etapa 2) — calendario de feriados por empresa y año. Ver
 * docs/prestamista/motor-financiero.md §1.5 y prestamista/motor/feriados.util.ts.
 * Un feriado agregado/quitado solo afecta préstamos que se desembolsen
 * después — nunca reprograma cuotas de préstamos ya generados (el motor
 * solo consulta este calendario al momento de crear la tabla).
 */
@Entity('pr_feriados')
@Index(['empresaId', 'anio', 'fecha'], { unique: true })
export class PrFeriado {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'int' }) anio!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 200 }) nombre!: string;
  /** false: feriado trasladable (Ley 139-97) que la empresa debe confirmar cada año. */
  @Column({ default: true }) confirmado!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
