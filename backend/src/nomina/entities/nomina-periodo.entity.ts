import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/users.entity';
import { NominaLinea } from './nomina-linea.entity';

export enum EstadoNomina {
  BORRADOR  = 'borrador',
  PROCESADA = 'procesada',
  PAGADA    = 'pagada',
  ANULADA   = 'anulada',
}

@Entity('nomina_periodos')
export class NominaPeriodo extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  fechaFin!: Date;

  @Column({ type: 'date' })
  fechaPago!: Date;

  @Column({ type: 'int', default: 30 })
  diasPeriodo!: number;

  @Column({ type: 'enum', enum: EstadoNomina, default: EstadoNomina.BORRADOR })
  estado!: EstadoNomina;

  @OneToMany(() => NominaLinea, (l) => l.periodo, { cascade: true })
  lineas!: NominaLinea[];

  @Column({ type: 'int', default: 0 })
  totalEmpleados!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalSalariosBruto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalTSSEmpleados!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalISR!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalOtrasDeducciones!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalNeto!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalTSSPatronal!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalCostoEmpresa!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
