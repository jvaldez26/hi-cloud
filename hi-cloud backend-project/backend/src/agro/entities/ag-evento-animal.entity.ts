import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_eventos_animal')
export class AgEventoAnimal {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() animalId!: number;
  @Column({ length: 50 }) tipo!: string;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true }) peso?: number;
  @Column({ length: 200, nullable: true }) producto?: string;
  @Column({ length: 50, nullable: true }) dosis?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) costo!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) cantidadProduccion?: number;
  @Column({ length: 20, nullable: true }) unidadProduccion?: string;
  @Column({ length: 200, nullable: true }) responsable?: string;
  @Column({ type: 'date', nullable: true }) proximaFecha?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @CreateDateColumn() createdAt!: Date;
}
