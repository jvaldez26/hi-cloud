import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('registros_capacitacion')
export class RegistroCapacitacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  sesionId: number;

  @Column()
  empleadoId: number;

  @Column({ default: false })
  asistio: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  calificacion?: number;

  @Column({ default: false })
  aprobado: boolean;

  @Column({ default: false })
  certificadoEmitido: boolean;

  @Column({ type: 'text', nullable: true })
  comentarios?: string;

  @CreateDateColumn()
  createdAt: Date;
}
