import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Vehiculo } from './vehiculo.entity';

export enum TipoRegistroFlota {
  COMBUSTIBLE  = 'combustible',
  MANTENIMIENTO= 'mantenimiento',
  SEGURO       = 'seguro',
  MULTA        = 'multa',
  PEAJE        = 'peaje',
  OTRO         = 'otro',
}

@Entity('registros_flota')
export class RegistroFlota extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  vehiculoId!: number;

  @ManyToOne(() => Vehiculo, { eager: true })
  @JoinColumn({ name: 'vehiculoId' })
  vehiculo!: Vehiculo;

  @Column({ type: 'enum', enum: TipoRegistroFlota })
  tipo!: TipoRegistroFlota;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'int', nullable: true })
  kilometraje?: number;

  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true })
  litros?: number;   // solo para combustible

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 100, nullable: true })
  proveedor?: string;

  @Column({ nullable: true })
  usuarioId?: number;
}
