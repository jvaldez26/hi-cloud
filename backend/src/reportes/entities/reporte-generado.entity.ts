import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/users.entity';

export enum TipoReporte {
  VENTAS = 'ventas',
  COMPRAS = 'compras',
  INVENTARIO = 'inventario',
  CLIENTES = 'clientes',
  ECF = 'ecf',
  ITBIS = 'itbis',
  GENERAL = 'general',
}

export enum FormatoReporte {
  JSON = 'json',
  PDF = 'pdf',
  EXCEL = 'excel',
}

export enum EstadoReporte {
  PROCESANDO = 'procesando',
  COMPLETADO = 'completado',
  ERROR = 'error',
}

@Entity('reportes_generados')
export class ReporteGenerado extends BaseEntity {
  @Column({ type: 'enum', enum: TipoReporte })
  tipo!: TipoReporte;

  @Column({ type: 'enum', enum: FormatoReporte, default: FormatoReporte.JSON })
  formato!: FormatoReporte;

  @Column({ type: 'json', nullable: true })
  parametros?: Record<string, unknown>;

  @Column({ length: 300, nullable: true })
  url?: string;

  @Column({ type: 'enum', enum: EstadoReporte, default: EstadoReporte.COMPLETADO })
  estado!: EstadoReporte;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ type: 'date' })
  fechaDesde!: Date;

  @Column({ type: 'date' })
  fechaHasta!: Date;
}
