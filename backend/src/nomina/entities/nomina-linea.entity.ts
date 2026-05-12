import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { NominaPeriodo } from './nomina-periodo.entity';
import { Empleado } from './empleado.entity';

@Entity('nomina_lineas')
export class NominaLinea extends BaseEntity {
  @ManyToOne(() => NominaPeriodo, (p) => p.lineas)
  @JoinColumn({ name: 'periodoId' })
  periodo!: NominaPeriodo;

  @Column()
  periodoId!: number;

  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado!: Empleado;

  @Column()
  empleadoId!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  salarioBase!: number;

  @Column({ type: 'int', default: 30 })
  diasTrabajados!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  salarioBruto!: number;

  // ── TSS Empleado (Ley 87-01) ──────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tssSfsEmpleado!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tssAfpEmpleado!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalTSSEmpleado!: number;

  // ── ISR (Ley 179-09) ──────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  isr!: number;

  // ── Otras Deducciones ─────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  otrasDeduciones!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalDeducciones!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  salarioNeto!: number;

  // ── TSS Patronal (costo empresa) ──────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tssSfsPatronal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tssAfpPatronal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  tssSrlPatronal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalTSSPatronal!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  costoTotalEmpleado!: number;
}
