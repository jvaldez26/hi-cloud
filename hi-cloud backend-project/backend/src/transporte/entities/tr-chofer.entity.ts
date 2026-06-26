import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tr_choferes')
export class TrChofer {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 150, nullable: true }) email?: string;
  @Column({ length: 50, nullable: true }) licencia?: string;
  @Column({ length: 20, nullable: true }) tipoLicencia?: string;
  @Column({ type: 'date', nullable: true }) vencimientoLicencia?: string;
  @Column({ length: 20, default: 'activo' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
