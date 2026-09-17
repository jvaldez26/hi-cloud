import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_cargos_condonaciones')
export class EdCargoCondonacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() cargoId!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) montoCondonado!: number;
  @Column({ type: 'text' }) motivo!: string;
  @Column({ nullable: true }) usuarioId?: number;
  @CreateDateColumn() createdAt!: Date;
}
