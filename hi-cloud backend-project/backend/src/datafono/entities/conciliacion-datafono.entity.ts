import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoConciliacion {
  BORRADOR   = 'borrador',
  CONFIRMADA = 'confirmada',
  CERRADA    = 'cerrada',
}

@TenantScoped()
@Entity('conciliaciones_datafono')
export class ConciliacionDatafono {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  terminalId: number;

  @Column({ type: 'date' })
  fechaDesde: string;

  @Column({ type: 'date' })
  fechaHasta: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalBruto: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalComisiones: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalNeto: number;

  @Column({ type: 'int', default: 0 })
  cantidadTransacciones: number;

  @Column({ length: 30, default: EstadoConciliacion.BORRADOR })
  estado: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
