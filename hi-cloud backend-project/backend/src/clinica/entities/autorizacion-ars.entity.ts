import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('cl_autorizaciones_ars')
export class AutorizacionArs {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 20, nullable: true }) numero!: string | null;
  @Column() pacienteId!: number;
  @Column({ type: 'int', nullable: true }) medicoId!: number | null;
  @Column({ length: 100 }) arsNombre!: string;
  @Column({ length: 50, nullable: true }) arsNumeroAfiliado!: string | null;
  @Column({ length: 100, nullable: true }) tipoServicio!: string | null;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ length: 100, nullable: true }) codigoAutorizacion!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) montoAutorizado!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) montoCubierto!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) montoPaciente!: number | null;
  @Column({ length: 30, default: 'pendiente' }) estado!: string;
  @Column({ type: 'date', nullable: true }) fechaSolicitud!: string | null;
  @Column({ type: 'date', nullable: true }) fechaRespuesta!: string | null;
  @Column({ type: 'text', nullable: true }) observaciones!: string | null;
  @Column({ type: 'int', nullable: true }) facturaId!: number | null;
  @CreateDateColumn() createdAt!: Date;
}
