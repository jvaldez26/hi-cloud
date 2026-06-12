import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_reclamaciones_ars')
export class ReclamacionArs {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero!: string | null;
  @Column({ length: 100 }) arsNombre!: string;
  @Column({ type: 'date', nullable: true }) periodoDesde!: string | null;
  @Column({ type: 'date', nullable: true }) periodoHasta!: string | null;
  @Column({ type: 'int', nullable: true }) cantidadDispensaciones!: number | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoTotal!: number | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoCubierto!: number | null;
  @Column({ length: 30, default: 'pendiente' }) estado!: string;
  @Column({ type: 'date', nullable: true }) fechaEnvio!: string | null;
  @Column({ type: 'date', nullable: true }) fechaPago!: string | null;
  @Column({ type: 'text', nullable: true }) observaciones!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
