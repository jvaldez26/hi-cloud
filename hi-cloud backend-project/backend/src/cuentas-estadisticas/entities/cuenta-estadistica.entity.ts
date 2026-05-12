import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { MovimientoEstadistico } from './movimiento-estadistico.entity';

export enum TipoCuentaEstadistica {
  ACUMULADOR = 'acumulador',  // suma los valores del período
  PROMEDIO   = 'promedio',    // promedio del período
  MAXIMO     = 'maximo',      // valor máximo registrado
  CONTEO     = 'conteo',      // número de registros
}

@Entity('cuentas_estadisticas')
@Index(['empresaId', 'isActive'])
export class CuentaEstadistica extends TenantBaseEntity {
  @Column({ length: 20 })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ length: 50, default: 'unidades' })
  unidad!: string;

  @Column({ type: 'enum', enum: TipoCuentaEstadistica, default: TipoCuentaEstadistica.ACUMULADOR })
  tipo!: TipoCuentaEstadistica;

  @Column({ length: 100, nullable: true })
  categoria?: string;

  @Column({ default: true })
  activa!: boolean;

  @OneToMany(() => MovimientoEstadistico, (m) => m.cuenta)
  movimientos!: MovimientoEstadistico[];
}
