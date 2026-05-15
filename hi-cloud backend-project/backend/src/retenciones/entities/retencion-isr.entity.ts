import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoServicioRetencion {
  PROFESIONAL           = 'profesional',          // 10%
  SERVICIOS_TECNICOS    = 'servicios_tecnicos',   // 10%
  ALQUILERES            = 'alquileres',            // 10%
  OTROS_SERVICIOS       = 'otros_servicios',       // 5%
  DIVIDENDOS            = 'dividendos',            // 10%
  INTERESES             = 'intereses',             // 10%
}

export const TASAS_RETENCION: Record<TipoServicioRetencion, number> = {
  [TipoServicioRetencion.PROFESIONAL]:        10,
  [TipoServicioRetencion.SERVICIOS_TECNICOS]: 10,
  [TipoServicioRetencion.ALQUILERES]:         10,
  [TipoServicioRetencion.OTROS_SERVICIOS]:    5,
  [TipoServicioRetencion.DIVIDENDOS]:         10,
  [TipoServicioRetencion.INTERESES]:          10,
};

@TenantScoped()
@Entity('retenciones_isr')
export class RetencionISR {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 7 })
  periodo!: string;

  @Column({ length: 200 })
  nombreProveedor!: string;

  @Column({ length: 11, nullable: true })
  rncProveedor?: string;

  @Column({ type: 'enum', enum: TipoServicioRetencion })
  tipoServicio!: TipoServicioRetencion;

  @Column({ length: 300 })
  descripcionServicio!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoBruto!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  porcentajeRetencion!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoRetenido!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoNeto!: number;

  @Column({ nullable: true })
  compraId?: number;

  @Column()
  userId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
