import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('op_recetas')
export class RecetaOptica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 30 })
  numero!: string;

  @Column()
  pacienteId!: number;

  @Column({ type: 'int', nullable: true })
  medicoId!: number | null;

  @Column({ type: 'int', nullable: true })
  consultaId!: number | null;

  @Column({ type: 'date' })
  fecha!: string;

  @Column({ length: 30, default: 'lentes' })
  tipo!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  esferaOD!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  cilindroOD!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  ejeOD!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  adicionOD!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  esferaOI!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  cilindroOI!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  ejeOI!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  adicionOI!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  dipLejos!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  dipCerca!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  marcaContacto!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tipoContacto!: string | null;

  @Column({ type: 'text', nullable: true })
  instrucciones!: string | null;

  @Column({ default: 1 })
  vigenciaAnos!: number;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
