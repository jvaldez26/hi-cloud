import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** Servicio, precio y duración CONGELADOS al recibir — cambiar el catálogo
 *  después no debe alterar lo ya cobrado o en curso. */
@Entity('cw_turno_servicios')
export class CwTurnoServicio {
  @PrimaryGeneratedColumn() id!: number;

  @Column() turnoId!: number;
  @Column() servicioId!: number;
  @Column({ length: 150 }) nombre!: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precio!: number;
  @Column() duracionMinutos!: number;

  @CreateDateColumn() createdAt!: Date;
}
