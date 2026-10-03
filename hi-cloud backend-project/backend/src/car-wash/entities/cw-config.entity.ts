import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { CobroEnCw } from './tipos';

@Entity('cw_config')
export class CwConfig {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() sucursalId!: number;

  @Column({ default: 1 }) bahiasActivas!: number;
  @Column({ length: 10, default: 'L' }) prefijoTurno!: string;
  @Column({ default: false }) usaSecado!: boolean;
  @Column({ type: 'varchar', length: 20, default: 'entrega' }) cobroEn!: CobroEnCw;
  @Column({ default: 24 }) horasCaducidadEnlace!: number;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
