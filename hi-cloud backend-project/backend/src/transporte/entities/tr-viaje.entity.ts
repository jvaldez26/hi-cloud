import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tr_viajes')
export class TrViaje {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ nullable: true }) sucursalId?: number;
  @Column({ length: 30 }) numero!: string;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ length: 200 }) origen!: string;
  @Column({ length: 200 }) destino!: string;
  @Column({ nullable: true }) clienteId?: number;
  @Column({ nullable: true }) choferId?: number;
  @Column({ nullable: true }) vehiculoId?: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) tarifa!: number;
  @Column({ length: 20, default: 'programado' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ nullable: true }) facturaId?: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
