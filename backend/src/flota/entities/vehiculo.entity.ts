import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum EstadoVehiculo {
  ACTIVO    = 'activo',
  EN_TALLER = 'en_taller',
  INACTIVO  = 'inactivo',
  DADO_BAJA = 'dado_baja',
}

@Entity('vehiculos')
export class Vehiculo extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 20, unique: true })
  placa!: string;

  @Column({ length: 100 })
  marca!: string;

  @Column({ length: 100 })
  modelo!: string;

  @Column({ type: 'int' })
  anio!: number;

  @Column({ length: 50, nullable: true })
  color?: string;

  @Column({ length: 50, nullable: true })
  tipoVehiculo?: string; // Sedan, Pickup, Van, Camión...

  @Column({ type: 'enum', enum: EstadoVehiculo, default: EstadoVehiculo.ACTIVO })
  estado!: EstadoVehiculo;

  @Column({ type: 'int', default: 0 })
  kilometraje!: number;

  @Column({ length: 100, nullable: true })
  conductor?: string;

  @Column({ nullable: true })
  conductorId?: number;

  @Column({ type: 'date', nullable: true })
  vencimientoItbis?: Date;   // Marbete

  @Column({ type: 'date', nullable: true })
  vencimientoSeguro?: Date;

  @Column({ type: 'date', nullable: true })
  vencimientoInspeccion?: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  valorCompra?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
