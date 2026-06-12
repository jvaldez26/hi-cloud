import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_sala_espera')
export class SalaEspera {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() citaId!: number;
  @Column() pacienteId!: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) horaLlegada!: Date;
  @Column({ type: 'timestamp', nullable: true }) horaLlamada!: Date | null;
  @Column({ type: 'timestamp', nullable: true }) horaAtencion!: Date | null;
  @Column({ length: 20, default: 'esperando' }) estado!: string;
  @Column({ type: 'int', nullable: true }) turno!: number | null;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
}
