import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_devoluciones')
export class Devolucion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero!: string | null;
  @Column({ type: 'int', nullable: true }) dispensacionId!: number | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'text' }) motivo!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) montoDevuelto!: number | null;
  @Column({ length: 20, default: 'procesada' }) estado!: string;
  @CreateDateColumn() createdAt!: Date;
}
