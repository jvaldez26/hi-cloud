import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_pacientes')
export class PacienteOptica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 100 })
  apellido!: string;

  @Column({ length: 20, nullable: true })
  cedula!: string | null;

  @Column({ type: 'date', nullable: true })
  fechaNacimiento!: string | null;

  @Column({ length: 10, nullable: true })
  genero!: string | null;

  @Column({ length: 20, nullable: true })
  telefono!: string | null;

  @Column({ length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  direccion!: string | null;

  @Column({ length: 100, nullable: true })
  ocupacion!: string | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
