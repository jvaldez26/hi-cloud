import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoEmpleado {
  ACTIVO     = 'activo',
  INACTIVO   = 'inactivo',
  SUSPENDIDO = 'suspendido',
}

export enum TipoContrato {
  INDEFINIDO = 'indefinido',
  FIJO       = 'fijo',
  TEMPORAL   = 'temporal',
}

export enum TipoPago {
  MENSUAL   = 'mensual',
  QUINCENAL = 'quincenal',
}

export enum Sexo {
  M = 'M',
  F = 'F',
}

@TenantScoped()
@Entity('empleados')
@Index(['empresaId', 'isActive'])
@Index(['empresaId', 'cedula'])
export class Empleado extends TenantBaseEntity {
  @Column({ length: 11 })
  cedula!: string;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 100 })
  apellido!: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ type: 'date' })
  fechaNacimiento!: Date;

  @Column({ type: 'date' })
  fechaIngreso!: Date;

  @Column({ type: 'date', nullable: true })
  fechaSalida?: Date;

  @Column({ length: 100 })
  cargo!: string;

  @Column({ length: 100, nullable: true })
  departamento?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  salarioBase!: number;

  @Column({ type: 'enum', enum: TipoPago, default: TipoPago.MENSUAL })
  tipoPago!: TipoPago;

  @Column({ type: 'enum', enum: TipoContrato, default: TipoContrato.INDEFINIDO })
  tipoContrato!: TipoContrato;

  @Column({ type: 'enum', enum: EstadoEmpleado, default: EstadoEmpleado.ACTIVO })
  estado!: EstadoEmpleado;

  @Column({ type: 'enum', enum: Sexo, nullable: true })
  sexo?: Sexo;

  @Column({ length: 100, nullable: true })
  banco?: string;

  @Column({ length: 30, nullable: true })
  cuentaBancaria?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  otrasDeduccionesFixed!: number;

  @Column({ length: 200, nullable: true })
  lugarTrabajo?: string;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  /** Moneda del salario (DOP o USD para empleados Zona Franca) */
  @Column({ length: 3, nullable: true, default: 'DOP' })
  moneda?: string;

  /** Tasa de cambio vigente al registrar el salario (solo aplica si moneda != DOP) */
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, default: 1 })
  tipoCambio?: number;

  /** ID del usuario del sistema vinculado (para Portal del Empleado) */
  @Column({ nullable: true })
  userId?: number;

  /** FK al catálogo de departamentos (nullable — retrocompatible con texto libre) */
  @Column({ nullable: true })
  departamentoId?: number;

  /** FK al catálogo de cargos (nullable — retrocompatible con texto libre) */
  @Column({ nullable: true })
  cargoId?: number;
}
