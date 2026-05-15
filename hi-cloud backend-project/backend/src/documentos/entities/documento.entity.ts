import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoEntidadDoc {
  FACTURA    = 'factura',
  COMPRA     = 'compra',
  CLIENTE    = 'cliente',
  PROVEEDOR  = 'proveedor',
  EMPLEADO   = 'empleado',
  CONTRATO   = 'contrato',
  GASTO      = 'gasto',
  ASIENTO    = 'asiento',
  PROYECTO   = 'proyecto',
  LICITACION = 'licitacion',
  GENERAL    = 'general',
}

@TenantScoped()
@Entity('documentos')
@Index(['empresaId', 'tipoEntidad', 'entidadId'])
@Index(['empresaId', 'isActive'])
export class Documento extends TenantBaseEntity {
  @Column({ type: 'enum', enum: TipoEntidadDoc, default: TipoEntidadDoc.GENERAL })
  tipoEntidad!: TipoEntidadDoc;

  @Column({ nullable: true })
  entidadId?: number;

  @Column({ length: 300 })
  nombre!: string;

  @Column({ length: 50, nullable: true })
  tipoMime?: string;

  @Column({ length: 10, nullable: true })
  extension?: string;

  @Column({ type: 'int', default: 0 })
  tamanioKb!: number;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column()
  subidoPorId!: number;

  @Column({ length: 200, nullable: true })
  nombreSubidoPor?: string;
}
