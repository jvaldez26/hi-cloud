import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Un tramo de efectivo entregado al deudor (Etapa 2 resto, §4) — la tabla
 * de amortización nace completa sobre el monto total desde el día uno;
 * solo el EFECTIVO puede entregarse en partes. `pr_prestamos.desembolsado`
 * acumula la suma de estos tramos (incluido el inicial, si lo hubo).
 */
@Entity('pr_desembolsos_parciales')
export class PrDesembolsoParcial {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() prestamoId!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) monto!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 20, nullable: true }) metodoPago?: string;
  /**
   * Etapa 5 — integración con Caja: solo se llena cuando metodoPago='efectivo'
   * y el cajero tiene una caja abierta (mismo patrón que Gasto.cajaDiariaId).
   * CajaService.recalcularDesdeBD() la suma a desembolsosPrestamoEfectivo.
   */
  @Column({ type: 'int', nullable: true }) cajaDiariaId?: number;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ type: 'int', nullable: true }) creadoPor?: number;
  @CreateDateColumn() createdAt!: Date;
}
