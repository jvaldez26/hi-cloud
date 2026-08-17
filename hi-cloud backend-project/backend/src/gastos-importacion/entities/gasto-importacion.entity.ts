import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';
import { GastoImportacionLinea } from './gasto-importacion-linea.entity';

export enum TipoGastoImportacion {
  FLETE          = 'flete',
  SEGURO         = 'seguro',
  ARANCEL        = 'arancel',
  AGENTE_ADUANAL = 'agente_aduanal',
  ALMACENAJE     = 'almacenaje',
  OTRO           = 'otro',
}

export enum CriterioProrrateo {
  VALOR_FOB = 'valor_fob',
  // PESO    = 'peso',    // disponible cuando productos.pesoKg exista
  // VOLUMEN = 'volumen', // disponible cuando productos.volumenM3 exista
}

export enum EstadoGasto {
  PENDIENTE = 'pendiente',
  APLICADO  = 'aplicado',
}

@Entity('gastos_importacion')
export class GastoImportacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresaId: number;

  @Column()
  compraId: number;

  /** Gancho para embarque multi-OC futuro — null hasta que se implemente */
  @Column({ nullable: true })
  embarqueId: number | null;

  @Column({ length: 200 })
  concepto: string;

  @Column({ length: 20 })
  tipo: TipoGastoImportacion;

  /** Monto en la moneda indicada */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto: number;

  @Column({ length: 3, default: 'DOP' })
  moneda: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  tipoCambio: number;

  /** monto × tipoCambio — siempre en DOP, es el valor que fluye al AVCO y al asiento */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  montoDOP: number;

  @Column({ length: 20, default: CriterioProrrateo.VALOR_FOB })
  criterioProrrateo: CriterioProrrateo;

  @Column({ length: 20, default: EstadoGasto.PENDIENTE })
  estado: EstadoGasto;

  /**
   * true  → gasto agregado a una compra que ya está en RECIBIDA/PAGADA.
   * false → gasto agregado antes de recibir: se calcula junto al AVCO de recepción.
   */
  @Column({ default: false })
  ajusteRetroactivo: boolean;

  /** Descripción del gasto que motivó este ajuste (para trazabilidad en retroactivos) */
  @Column({ type: 'text', nullable: true })
  motivoAjuste: string | null;

  @Column({ nullable: true })
  aplicadoAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => GastoImportacionLinea, l => l.gasto, { cascade: true })
  lineas: GastoImportacionLinea[];
}
