import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, Index, CreateDateColumn,
} from 'typeorm';
import { ConteoInventario } from './conteo-inventario.entity';
import { LineaConteo } from './linea-conteo.entity';
import { User } from '../../users/users.entity';

// Registro inmutable: un ajuste NO se edita ni desactiva.
// La tabla NO tiene isActive ni updatedAt — no extiende BaseEntity.
// Las FK sin CASCADE en conteoId/lineaId bloquean borrar conteos ajustados en DB.
export type AjusteTipo = 'sobrante' | 'faltante';

@Entity('conteo_ajustes')
@Index(['empresaId', 'conteoId'])
@Index(['movimientoId'])
export class ConteoAjuste {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ nullable: true })
  empresaId!: number;

  @ManyToOne(() => ConteoInventario)
  @JoinColumn({ name: 'conteoId' })
  conteo!: ConteoInventario;

  @Column()
  conteoId!: number;

  @ManyToOne(() => LineaConteo)
  @JoinColumn({ name: 'lineaId' })
  linea!: LineaConteo;

  @Column()
  lineaId!: number;

  @Column()
  productoId!: number;

  // ID del movimiento_inventario generado por este ajuste (trazabilidad bidireccional)
  @Column()
  movimientoId!: number;

  // AVISO: TypeORM devuelve DECIMAL como string — usar Number() en el service.
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadAntes!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  cantidadDespues!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  diferencia!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  costoUnitario!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  valorImpacto!: string;

  @Column({ length: 10 })
  tipo!: AjusteTipo;

  // true si el producto tiene lotes: ajuste no desagrega por lote (solo informativo)
  @Column({ default: false })
  avisaLotes!: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'aplicadoPorId' })
  aplicadoPor!: User;

  @Column()
  aplicadoPorId!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  aplicadoEn!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
