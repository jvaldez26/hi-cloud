import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_reservaciones')
export class RsReservacion {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) numero: string;
  @Column() clienteNombre: string;
  @Column({ nullable: true }) clienteTelefono: string;
  @Column({ nullable: true }) clienteEmail: string;
  @Column({ nullable: true }) clienteId: number;
  @Column({ type: 'date' }) fecha: string;
  @Column({ type: 'time' }) hora: string;
  @Column() numPersonas: number;
  @Column({ nullable: true }) mesaId: number;
  @Column({ nullable: true }) ocasionEspecial: string;
  @Column({ nullable: true }) peticionesEspeciales: string;
  @Column({ default: 'confirmada' }) estado: string;
  @Column({ default: false }) recordatorioEnviado: boolean;
  @Column({ nullable: true }) notas: string;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
