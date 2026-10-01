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
  // empresaId es NOT NULL a nivel de BD (ver la migración CreateXlinkMapeos):
  // un mapeo sin empresa no tiene sentido de existir. Esto SÍ se desvía del
  // nullable:true genérico de TenantBaseEntity.empresaId — a propósito, pero
  // no se puede reflejar aquí: TypeORM no deja que una subclase sobreescriba
  // las opciones del @Column() de una columna heredada (se probó con un
  // `declare empresaId` + @Column propio — la metadata de la clase base sigue
  // ganando). Diferencia conocida y aceptada entre entidad/synchronize (dice
  // nullable) y la BD real vía migración (NOT NULL): el código nunca debe
  // guardar un XlinkMapeo sin empresaId, y si lo intentara, la BD lo rechaza.

  @Column({ type: 'uuid' })
  contraparteXlinkId!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: XlinkMapeoTipo;

  @Column({ type: 'text' })
  valorExterno!: string;

  @Column()
  valorInternoId!: number;
}
