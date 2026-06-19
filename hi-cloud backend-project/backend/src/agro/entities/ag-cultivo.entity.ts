import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ag_cultivos')
export class AgCultivo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 100 }) nombre!: string;
  @Column({ length: 100, nullable: true }) variedad?: string;
  @Column({ length: 50, nullable: true }) tipo?: string;
  @Column({ type: 'int', nullable: true }) diasCicloPromedio?: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) rendimientoEsperado?: number;
  @Column({ length: 30, nullable: true }) unidadRendimiento?: string;
  @Column({ length: 50, nullable: true }) unidadPorArea?: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
