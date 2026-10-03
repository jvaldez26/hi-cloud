import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cw_servicios')
export class CwServicio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;

  @Column({ length: 150 }) nombre!: string;
  @Column() productoId!: number;
  @Column({ default: true }) activo!: boolean;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
