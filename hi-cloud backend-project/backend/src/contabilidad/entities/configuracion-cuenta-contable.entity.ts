import { Entity, Column, Unique } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Configuración contable por empresa (2026-09-19) — reemplaza, concepto por
 * concepto, los códigos de cuenta que hoy viven hardcodeados en el objeto
 * `COD` de AsientosAutomaticosService. Una fila por (empresaId, concepto);
 * sin fila = se usa el default de `COD` (o el literal fijo del motor) — así
 * que una empresa sin ninguna configuración se comporta EXACTAMENTE igual
 * que antes de esta tabla existir.
 *
 * `concepto` es el nombre de la clave de `COD` (p. ej. 'CLIENTES', 'BANCOS')
 * o uno de los conceptos nuevos más finos que no tenían nombre propio antes
 * (p. ej. 'COBRO_TARJETA', 'COBRO_TRANSFERENCIA' — ver
 * ConfiguracionContableService.CONCEPTOS para el catálogo completo con su
 * default y su descripción).
 */
@TenantScoped()
@Entity('configuraciones_cuentas_contables')
@Unique(['empresaId', 'concepto'])
export class ConfiguracionCuentaContable extends TenantBaseEntity {
  @Column({ length: 60 })
  concepto!: string;

  @Column({ length: 20 })
  cuentaCodigo!: string;
}
