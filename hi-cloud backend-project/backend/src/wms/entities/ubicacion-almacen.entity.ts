import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Almacen } from '../../almacenes/entities/almacen.entity';

export enum TipoUbicacion {
  PICKING    = 'picking',    // ubicación de picking diario
  BULK       = 'bulk',       // almacenamiento masivo
  RECEPCION  = 'recepcion',  // zona de recepción de mercancía
  DESPACHO   = 'despacho',   // zona de despacho/staging
  CUARENTENA = 'cuarentena', // productos en espera de aprobación
}

@Entity('wms_ubicaciones')
@Index(['empresaId', 'almacenId'])
@Index(['empresaId', 'codigo'])
export class UbicacionAlmacen extends TenantBaseEntity {
  @ManyToOne(() => Almacen, { eager: true })
  @JoinColumn({ name: 'almacenId' })
  almacen!: Almacen;

  @Column()
  almacenId!: number;

  @Column({ length: 30 })
  codigo!: string;      // e.g. "A-01-03-02"

  @Column({ length: 10, nullable: true })
  pasillo?: string;     // A, B, C...

  @Column({ length: 10, nullable: true })
  estante?: string;     // 01, 02...

  @Column({ length: 10, nullable: true })
  nivel?: string;       // 01 (bajo) → 05 (alto)

  @Column({ length: 10, nullable: true })
  posicion?: string;    // 01, 02...

  @Column({ type: 'enum', enum: TipoUbicacion, default: TipoUbicacion.PICKING })
  tipo!: TipoUbicacion;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  capacidadKg?: number;

  @Column({ default: true })
  activa!: boolean;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
