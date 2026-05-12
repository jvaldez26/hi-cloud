import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('reportes_dgii')
@Index(['empresaId'])
@Index(['empresaId', 'tipo', 'anio', 'mes'])
export class ReporteDgii {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 3 })
  tipo!: string; // '606' | '607' | '608'

  @Column({ type: 'int' })
  mes!: number;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ type: 'int', default: 0 })
  totalLineas!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalMonto!: number;

  @Column({ type: 'int', default: 0 })
  errores!: number;

  @Column({ type: 'int', default: 0 })
  advertencias!: number;

  @Column({ nullable: true })
  generadoPor?: number;

  @Column({ length: 64, nullable: true })
  hashContenido?: string;

  @Column({ type: 'text', nullable: true })
  contenido?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
