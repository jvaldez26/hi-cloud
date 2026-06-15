import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity('gm_reservas_clases')
@Unique(['miembroId', 'scheduleId', 'fecha'])
export class ReservaClase {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column() scheduleId!: number;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ default: 'reservada' }) estado!: string;
  @Column({ default: false }) pagado!: boolean;
  @Column({ nullable: true }) facturaId?: number;
  @CreateDateColumn() createdAt!: Date;
}
