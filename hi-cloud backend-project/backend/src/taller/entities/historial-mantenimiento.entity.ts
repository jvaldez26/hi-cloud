import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tm_historial_mantenimiento')
export class HistorialMantenimiento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() vehiculoId!: number;
  @Column({ type: 'int', nullable: true }) ordenId!: number | null;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) tipo!: string | null;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ type: 'int', nullable: true }) kilometraje!: number | null;
  @Column({ type: 'int', nullable: true }) proximoMantenimientoKm!: number | null;
  @Column({ type: 'date', nullable: true }) proximoMantenimientoFecha!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costo!: number | null;
  @CreateDateColumn() createdAt!: Date;
}
