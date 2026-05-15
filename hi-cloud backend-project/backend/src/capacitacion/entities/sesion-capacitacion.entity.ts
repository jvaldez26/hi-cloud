import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('sesiones_capacitacion')
export class SesionCapacitacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  cursoId: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 10, nullable: true })
  hora?: string;

  @Column({ length: 200, nullable: true })
  lugar?: string;

  @Column({ length: 20, default: 'presencial' })
  modalidad: string;

  @Column({ type: 'int', nullable: true })
  capacidadMaxima?: number;

  @Column({ length: 20, default: 'programada' })
  estado: string; // programada, en_progreso, completada, cancelada

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
