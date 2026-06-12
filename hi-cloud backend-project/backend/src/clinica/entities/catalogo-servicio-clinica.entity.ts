import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cl_catalogo_servicios')
export class CatalogoServicioClinica {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 50, nullable: true }) codigo!: string | null;
  @Column({ length: 200 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ length: 100, nullable: true }) especialidad!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precio!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioArs!: number | null;
  @Column({ default: 30 }) duracionMinutos!: number;
  @Column({ default: false }) requiereAutorizacion!: boolean;
  @Column({ default: true }) isActive!: boolean;
}
