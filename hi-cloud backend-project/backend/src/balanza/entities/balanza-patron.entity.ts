import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export type TipoDatoBal = 'peso' | 'precio';

/**
 * Patrón de decodificación para balanzas etiquetadoras.
 *
 * Geometría:  prefijo.length + longitudPlu + longitudValor + 1 = longitudTotal
 *
 * Ver balanza-parser.ts para descripción completa del algoritmo de parseo.
 */
@TenantScoped()
@Entity('balanza_patrones')
@Index(['empresaId', 'isActive'])
export class BalanzaPatron extends TenantBaseEntity {
  /** Nombre descriptivo: "Mettler Toledo 5-PLU peso" */
  @Column({ length: 100 })
  nombre!: string;

  /** Prefijo del código EAN: '2', '20'…'29' */
  @Column({ length: 4 })
  prefijo!: string;

  /** Número de dígitos del PLU (4, 5 o 6) */
  @Column({ type: 'smallint', name: 'longitudPlu' })
  longitudPlu!: number;

  /** ¿El campo de valor contiene peso o precio? */
  @Column({ type: 'varchar', length: 10, default: 'peso' })
  tipoDato!: TipoDatoBal;

  /**
   * Número de dígitos del campo de valor.
   * Si tieneCheckValor=true, el último dígito es el check interno;
   * el valor efectivo usa (longitudValor - 1) dígitos.
   */
  @Column({ type: 'smallint', name: 'longitudValor' })
  longitudValor!: number;

  /** Decimales al interpretar el campo de valor. Ej: 3 → 004500 = 4.500 */
  @Column({ type: 'smallint', default: 3, name: 'decimalesValor' })
  decimalesValor!: number;

  /**
   * Código UOM esperado del producto: 'KG', 'LB', etc.
   * NULL cuando tipoDato = 'precio'.
   * Al escanear, si producto.unidadMedida ≠ unidadPeso → RECHAZAR con error explícito.
   */
  @Column({ length: 20, nullable: true, name: 'unidadPeso' })
  unidadPeso?: string;

  /**
   * El último dígito de longitudValor es un verificador de la balanza
   * (suma de los dígitos anteriores mod 10).
   */
  @Column({ type: 'boolean', default: false, name: 'tieneCheckValor' })
  tieneCheckValor!: boolean;

  /** Longitud total del código: 13 (EAN-13) o 12 (UPC-A) */
  @Column({ type: 'smallint', default: 13, name: 'longitudTotal' })
  longitudTotal!: number;

  /**
   * Resolución de conflictos: cuando varios patrones podrían coincidir,
   * gana el de menor prioridad. 100 = valor por defecto.
   */
  @Column({ type: 'smallint', default: 100 })
  prioridad!: number;
}
