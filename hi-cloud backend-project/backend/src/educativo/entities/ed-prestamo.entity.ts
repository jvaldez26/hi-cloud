import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_biblioteca_prestamos')
export class EdPrestamo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() libroId!: number;
  @Column({ nullable: true }) estudianteId?: number;
  @Column({ nullable: true }) docenteId?: number;
  @Column({ type: 'date', nullable: true }) fechaPrestamo?: string;
  @Column({ type: 'date', nullable: true }) fechaVencimiento?: string;
  @Column({ type: 'date', nullable: true }) fechaDevolucion?: string;
  @Column({ length: 20, default: 'prestado' }) estado!: string;
  @CreateDateColumn() createdAt!: Date;
}
