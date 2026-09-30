import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum XlinkMapeoTipo {
  PRODUCTO      = 'producto',
  UNIDAD        = 'unidad',
  IMPUESTO      = 'impuesto',
  TERMINO_PAGO  = 'termino_pago',
  RETENCION     = 'retencion',
}

/**
 * Mapeos guardados por contraparte — para no volver a pedir la misma
 * homologación (producto/unidad/impuesto/término de pago/retención) en cada
 * recepción futura de esa misma empresa. Tenant-scoped normal (tiene
 * empresaId, es de UNA sola empresa: la que recibe y resuelve el mapeo).
 */
@TenantScoped()
@Entity('xlink_mapeos')
@Index(['empresaId', 'contraparteXlinkId'])
export class XlinkMapeo extends TenantBaseEntity {
  @Column({ type: 'uuid' })
  contraparteXlinkId!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: XlinkMapeoTipo;

  @Column({ type: 'text' })
  valorExterno!: string;

  @Column()
  valorInternoId!: number;
}
