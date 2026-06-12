import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_vehiculos')
export class Vehiculo {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20 }) placa!: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) vin!: string | null;
  @Column({ length: 100 }) marca!: string;
  @Column({ length: 100 }) modelo!: string;
  @Column({ type: 'int', nullable: true }) anio!: number | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) color!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) tipo!: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) combustible!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) transmision!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) cilindraje!: string | null;
  @Column({ type: 'int', default: 0 }) kilometrajeActual!: number;
  @Column({ type: 'int', nullable: true }) kilometrajeUltimoServicio!: number | null;
  @Column({ type: 'int', nullable: true }) proximoServicioKm!: number | null;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) propietarioNombre!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) propietarioTelefono!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) propietarioEmail!: string | null;
  @Column({ type: 'text', nullable: true }) observaciones!: string | null;
  @Column({ type: 'text', nullable: true }) imagenUrl!: string | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
