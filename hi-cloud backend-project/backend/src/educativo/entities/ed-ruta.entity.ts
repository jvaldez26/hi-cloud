import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_transporte_rutas')
export class EdRuta {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 150 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion?: string;
  @Column({ length: 200, nullable: true }) chofer?: string;
  @Column({ length: 20, nullable: true }) choferTelefono?: string;
  @Column({ length: 20, nullable: true }) vehiculoPlaca?: string;
  @Column({ nullable: true }) capacidad?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) costoMensual?: number;
  @Column({ type: 'jsonb', nullable: true }) paradas?: any[];
  @Column({ default: true }) isActive!: boolean;
}
