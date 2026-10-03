import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import type { EstadoTurnoCw } from './tipos';

@Entity('cw_turno_eventos')
export class CwTurnoEvento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() turnoId!: number;
  @Column() empresaId!: number;

  @Column({ type: 'varchar', length: 20, nullable: true }) estadoAnterior?: EstadoTurnoCw;
  @Column({ type: 'varchar', length: 20 }) estadoNuevo!: EstadoTurnoCw;
  @Column({ type: 'int', nullable: true }) usuarioId?: number;
  @Column({ type: 'text', nullable: true }) motivo?: string;

  @CreateDateColumn() createdAt!: Date;
}
