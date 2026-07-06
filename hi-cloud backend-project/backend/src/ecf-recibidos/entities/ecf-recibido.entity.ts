import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

export enum FuenteImportacion {
  CSV = 'csv',
  API = 'api',
}

@Entity('ecf_recibidos')
@Unique(['empresaId', 'encf'])
export class EcfRecibido {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int' })
  empresaId: number;

  /** e-NCF del comprobante recibido, ej: E310000541264 */
  @Column({ length: 20 })
  encf: string;

  @Column({ length: 15, nullable: true })
  rncEmisor: string;

  @Column({ length: 200, nullable: true })
  nombreEmisor: string;

  @Column({ type: 'date', nullable: true })
  fechaDocumento: Date;

  /** Prefijo numérico del tipo: '31', '32', '33', '34', '41', '43', '44', '45', '46', '47' */
  @Column({ length: 5, nullable: true })
  tipoEcf: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  montoGravado: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  itbis: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  montoExento: number;

  @Column({ length: 50, default: 'received' })
  status: string;

  /** 'csv' (Fase 1) | 'api' (Fase 2 — sincronización automática con MSeller) */
  @Column({ length: 10, default: FuenteImportacion.CSV })
  fuenteImportacion: FuenteImportacion;

  /** Fase 2: marcar como procesado cuando se registre como compra/gasto */
  @Column({ type: 'boolean', default: false })
  procesadoComoCompra: boolean;

  /** Fecha de creación del registro en MSeller (campo "Creado" del CSV) */
  @Column({ type: 'timestamp', nullable: true })
  creadoEnMseller: Date;

  /** URL del documento en MSeller (campo "urldocumento" del CSV) */
  @Column({ type: 'text', nullable: true })
  urlDocumento: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
