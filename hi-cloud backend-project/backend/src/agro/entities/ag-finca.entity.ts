import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_fincas')
export class AgFinca {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 300, nullable: true }) ubicacion?: string;
  @Column({ length: 100, nullable: true }) provincia?: string;
  @Column({ length: 100, nullable: true }) municipio?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) areaTotal?: number;
  @Column({ length: 20, default: 'tarea' }) unidadArea!: string;
  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true }) latitud?: number;
  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true }) longitud?: number;
  @Column({ default: false }) tieneRiego!: boolean;
  @Column({ length: 50, nullable: true }) tipoRiego?: string;
  @Column({ length: 100, nullable: true }) fuenteAgua?: string;
  @Column({ length: 200, nullable: true }) encargado?: string;
  @Column({ length: 20, nullable: true }) encargadoTelefono?: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
