import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum EstadoChequera {
  ACTIVA    = 'activa',
  AGOTADA   = 'agotada',
  ANULADA   = 'anulada',
}

@TenantScoped()
@Entity('chequeras')
export class Chequera extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 80 })
  banco!: string;

  @Column({ length: 30 })
  numeroCuenta!: string;

  @Column({ length: 80, nullable: true })
  nombreCuenta?: string;

  @Column({ type: 'int' })
  serieDesde!: number;

  @Column({ type: 'int' })
  serieHasta!: number;

  @Column({ type: 'int' })
  siguienteNumero!: number;

  @Column({ type: 'enum', enum: EstadoChequera, default: EstadoChequera.ACTIVA })
  estado!: EstadoChequera;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;
}
