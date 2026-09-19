import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { AsientoContable } from './asiento-contable.entity';
import { CuentaContable } from './cuenta-contable.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('asiento_lineas')
export class AsientoLinea extends TenantBaseEntity {
  @ManyToOne(() => AsientoContable, (a) => a.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asientoId' })
  asiento!: AsientoContable;

  @Column()
  asientoId!: number;

  @ManyToOne(() => CuentaContable, { eager: true })
  @JoinColumn({ name: 'cuentaContableId' })
  cuentaContable!: CuentaContable;

  @Column()
  cuentaContableId!: number;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debe!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  haber!: number;

  /**
   * Selector de cuenta contable en formularios transaccionales (2026-09-19)
   * — true cuando el usuario cambió esta línea a una cuenta distinta de la
   * que el motor habría usado por defecto (categoría, config, etc.). El
   * "quién" ya lo trae AsientoContable.userId; esto es el "fue a propósito".
   * NULL/false en el resto de las líneas — el motor nunca lo marca solo.
   */
  @Column({ type: 'boolean', nullable: true })
  cuentaManual?: boolean;
}
