import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { EtapaRuta } from './etapa-ruta.entity';

@Entity('rutas_produccion')
@Index(['empresaId', 'isActive'])
export class RutaProduccion extends TenantBaseEntity {
  @Column({ length: 20 })
  codigo!: string;

  @Column({ length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  listaId?: number;   // BOM opcional — si está seteado, es la ruta por defecto de esa BOM

  @Column({ default: true })
  activa!: boolean;

  @OneToMany(() => EtapaRuta, (e) => e.ruta, { cascade: true, eager: true })
  etapas!: EtapaRuta[];
}
