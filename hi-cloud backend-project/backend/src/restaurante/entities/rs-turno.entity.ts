import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_turnos')
export class RsTurno {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) numero: string;
  @Column({ nullable: true }) usuarioId: number;
  @Column({ nullable: true }) usuarioNombre: string;
  @Column({ default: () => 'NOW()' }) fechaApertura: Date;
  @Column({ nullable: true }) fechaCierre: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) fondoInicial: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalVentas: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalEfectivo: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalTarjeta: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalTransferencia: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalPropinas: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) totalDescuentos: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) efectivoContado: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) diferencia: number;
  @Column({ default: 'abierto' }) estado: string;
  @Column({ nullable: true }) notas: string;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
