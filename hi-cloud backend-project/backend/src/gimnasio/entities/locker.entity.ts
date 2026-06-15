import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('gm_lockers')
export class Locker {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20 }) numero!: string;
  @Column({ length: 50, nullable: true }) area?: string;
  @Column({ default: 'disponible' }) estado!: string;
  @Column({ nullable: true }) miembroId?: number;
  @Column({ type: 'date', nullable: true }) fechaAsignacion?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioMes!: number;
  @Column({ default: true }) isActive!: boolean;
}
