import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('cursos_capacitacion')
export class Curso {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @Column({ length: 150, nullable: true })
  instructor?: string;

  @Column({ type: 'int', default: 0 })
  duracionHoras: number;

  @Column({ length: 20, default: 'presencial' })
  modalidad: string; // presencial, virtual, mixto

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
