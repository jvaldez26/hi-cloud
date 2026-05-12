import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { ValorAtributo } from './valor-atributo.entity';

export enum TipoAtributo {
  DIMENSION  = 'dimension',   // Talla, Peso, Volumen
  COLOR      = 'color',       // Color, Acabado
  MATERIAL   = 'material',    // Material, Tejido
  SABOR      = 'sabor',       // Sabor, Aroma
  OTRO       = 'otro',
}

@Entity('atributos_producto')
@Index(['empresaId', 'isActive'])
export class AtributoProducto extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'enum', enum: TipoAtributo, default: TipoAtributo.OTRO })
  tipo!: TipoAtributo;

  @Column({ length: 50, nullable: true })
  unidad?: string;     // kg, cm, ml, etc.

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany(() => ValorAtributo, (v) => v.atributo, { cascade: true })
  valores!: ValorAtributo[];
}
