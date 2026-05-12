import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

export enum TipoUnidad {
  PESO     = 'peso',      // kg, g, lb, oz, ton
  VOLUMEN  = 'volumen',   // L, mL, galón, m³
  LONGITUD = 'longitud',  // m, cm, mm, ft, in
  AREA     = 'area',      // m², ft²
  TIEMPO   = 'tiempo',    // hora, día, mes
  CANTIDAD = 'cantidad',  // unidad, docena, caja, palet
  OTRO     = 'otro',
}

@Entity('unidades_medida')
@Index(['empresaId', 'isActive'])
export class UnidadMedida extends TenantBaseEntity {
  @Column({ length: 20 })
  codigo!: string;   // KG, G, LB, PZA, DOC

  @Column({ length: 100 })
  nombre!: string;   // Kilogramo, Gramo, Libra

  @Column({ length: 10, nullable: true })
  simbolo?: string;  // kg, g, lb, pza

  @Column({ type: 'enum', enum: TipoUnidad, default: TipoUnidad.CANTIDAD })
  tipo!: TipoUnidad;

  @Column({ default: true })
  activa!: boolean;

  @Column({ default: false })
  esBase!: boolean;  // unidad base del tipo (ej. KG para peso)
}
