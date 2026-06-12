import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_tecnicos')
export class TecnicoTaller {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) especialidad!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) telefono!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) email!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) tarifaHora!: number | null;
  @Column({ type: 'int', nullable: true }) empleadoId!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
