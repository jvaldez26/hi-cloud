import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Corrección de forma de pago de una factura cuyo turno YA CERRÓ — el
 * cierre original (`CierreCaja.cuadrePorFormaPago`) nunca se reescribe
 * (es el número con el que el cajero cuadró de verdad), esta tabla deja el
 * ajuste aparte, vinculado al cierre, para que el reporte muestre "cuadre
 * corregido" sin perder el original.
 */
@TenantScoped()
@Entity('ajustes_cierre_caja')
@Index(['cierreCajaId'])
export class AjusteCierreCaja {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() cierreCajaId!: number;
  @Column() facturaId!: number;
  @Column({ type: 'varchar', length: 30, nullable: true }) facturaFolio?: string;
  @Column({ type: 'jsonb' }) formasPagoAnterior!: { tipo: number; monto: number }[];
  @Column({ type: 'jsonb' }) formasPagoNuevo!: { tipo: number; monto: number }[];
  @Column({ type: 'text' }) motivo!: string;
  @Column() corregidoPor!: number;
  @Column({ type: 'varchar', length: 150, nullable: true }) corregidoPorNombre?: string;
  @CreateDateColumn() createdAt!: Date;
}
