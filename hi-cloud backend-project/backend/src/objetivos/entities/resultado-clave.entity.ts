import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Objetivo } from './objetivo.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum TipoResultado {
  NUMERO     = 'numero',    // Meta numérica (ej: 100 clientes)
  PORCENTAJE = 'porcentaje',// Meta % (ej: 95% satisfacción)
  BOOLEANO   = 'booleano',  // Sí/No (ej: lanzar producto)
}

@TenantScoped()
@Entity('resultados_clave')
export class ResultadoClave extends TenantBaseEntity {
  @Column()
  objetivoId!: number;

  @ManyToOne(() => Objetivo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'objetivoId' })
  objetivo!: Objetivo;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'enum', enum: TipoResultado, default: TipoResultado.NUMERO })
  tipo!: TipoResultado;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  valorInicio!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  valorMeta!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  valorActual!: number;

  @Column({ type: 'int', default: 0 })
  progreso!: number; // 0–100

  @Column({ length: 50, nullable: true })
  unidad?: string;  // "clientes", "%", "RD$", etc.
}
