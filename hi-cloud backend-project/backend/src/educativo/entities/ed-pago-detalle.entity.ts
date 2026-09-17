import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Qué cargos cubrió un pago y cuánto de cada uno — reemplaza el
 * cargosAfectados (JSONB, nunca escrito) y el cargoId (siempre uno solo) de
 * la migración original. Un pago puede cubrir varios cargos; la relación es
 * consultable con un JOIN normal, no un JSONB que nadie puede reportar.
 */
@Entity('ed_pagos_detalle')
export class EdPagoDetalle {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() pagoId!: number;
  @Column() cargoId!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) monto!: number;
  @CreateDateColumn() createdAt!: Date;
}
