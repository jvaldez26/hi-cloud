import {
  Entity,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoECF } from './tipo-ecf.entity';
import { SecuenciaECF } from './secuencia-ecf.entity';
import { Factura } from '../../facturas/entities/factura.entity';

export enum EstadoDGII {
  PENDIENTE = 'pendiente',
  ACEPTADO = 'aceptado',
  RECHAZADO = 'rechazado',
  CONDICIONADO = 'condicionado',
}

@Entity('ecf')
export class ECF extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @Column({ length: 13 })
  numero!: string;

  @ManyToOne(() => TipoECF, { eager: true })
  @JoinColumn({ name: 'tipoECFId' })
  tipoECF!: TipoECF;

  @Column()
  tipoECFId!: number;

  @ManyToOne(() => SecuenciaECF)
  @JoinColumn({ name: 'secuenciaId' })
  secuencia!: SecuenciaECF;

  @Column()
  secuenciaId!: number;

  @OneToOne(() => Factura, { nullable: true, eager: false })
  @JoinColumn({ name: 'facturaId' })
  factura?: Factura;

  @Column({ nullable: true })
  facturaId?: number;

  @Column({ type: 'timestamp', nullable: true })
  fechaUso?: Date;

  @Column({ default: false })
  isUsado!: boolean;

  @Column({ type: 'enum', enum: EstadoDGII, default: EstadoDGII.PENDIENTE })
  estadoDGII!: EstadoDGII;

  @Column({ length: 6 })
  codigoSeguridad!: string;

  @Column({ type: 'text', nullable: true })
  xml?: string;

  @Column({ type: 'text', nullable: true })
  xmlRespuesta?: string;

  @Column({ type: 'text', nullable: true })
  firmaDigital?: string;

  @Column({ type: 'timestamp', nullable: true })
  fechaFirma?: Date;

  @Column({ type: 'int', default: 0 })
  intentosEnvio!: number;

  @Column({ type: 'timestamp', nullable: true })
  ultimoIntentoEnvio?: Date;

  @Column({ type: 'text', nullable: true })
  errorEnvio?: string;

  @Column({ length: 100, nullable: true })
  proveedorReferencia?: string;
}
