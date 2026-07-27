import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_docentes')
export class EdDocente {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 30, nullable: true }) codigo?: string;
  @Column({ length: 200 }) nombres!: string;
  @Column({ length: 200, nullable: true }) apellidos?: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ type: 'date', nullable: true }) fechaNacimiento?: string;
  @Column({ length: 10, nullable: true }) sexo?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ type: 'text', nullable: true }) foto?: string;
  @Column({ length: 200, nullable: true }) titulo?: string;
  @Column({ length: 200, nullable: true }) especialidad?: string;
  @Column({ type: 'date', nullable: true }) fechaIngreso?: string;
  @Column({ nullable: true }) empleadoId?: number;
  @Column({ nullable: true }) usuarioId?: number;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
