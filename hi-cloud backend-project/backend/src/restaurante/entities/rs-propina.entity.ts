import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_propinas')
export class RsPropina {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) comandaId: number;
  @Column({ nullable: true }) meseroId: number;
  @Column({ nullable: true }) meseroNombre: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) monto: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) porcentaje: number;
  @Column({ nullable: true }) metodoPago: string;
  @Column({ default: () => 'NOW()' }) fecha: Date;
}
