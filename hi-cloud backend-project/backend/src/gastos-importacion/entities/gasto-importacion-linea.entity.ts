import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { GastoImportacion } from './gasto-importacion.entity';

@Entity('gastos_importacion_lineas')
export class GastoImportacionLinea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  gastoImportacionId: number;

  @Column()
  compraDetalleId: number;

  /** Fracción del gasto.montoDOP asignada a esta línea de compra */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  montoAsignado: number;

  /** montoAsignado ÷ detalle.cantidadTotal — lo que sube al costo unitario */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  montoUnitario: number;

  /** true si el usuario sobreescribió el prorrateo automático */
  @Column({ default: false })
  ajusteManual: boolean;

  @ManyToOne(() => GastoImportacion, g => g.lineas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gastoImportacionId' })
  gasto: GastoImportacion;
}
