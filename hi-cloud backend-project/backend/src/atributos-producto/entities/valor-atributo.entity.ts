import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { AtributoProducto } from './atributo-producto.entity';

@Entity('valores_atributo')
export class ValorAtributo extends TenantBaseEntity {
  @ManyToOne(() => AtributoProducto, (a) => a.valores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'atributoId' })
  atributo!: AtributoProducto;

  @Column()
  atributoId!: number;

  @Column({ length: 100 })
  valor!: string;    // "XL", "Rojo", "Algodón"

  @Column({ length: 30, nullable: true })
  codigo?: string;   // código abreviado: "XL", "R"

  @Column({ length: 7, nullable: true })
  colorHex?: string; // solo para tipo color: "#FF0000"

  @Column({ type: 'int', default: 0 })
  orden!: number;
}
