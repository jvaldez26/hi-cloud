import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fa_dispensaciones')
export class Dispensacion {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero!: string | null;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fecha!: Date;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) clienteNombre!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) clienteCedula!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) recetaMedico!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) recetaNumero!: string | null;
  @Column({ type: 'date', nullable: true }) recetaFecha!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) arsNombre!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) arsNumeroAfiliado!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) autorizacionArs!: string | null;
  @Column({ type: 'int', nullable: true }) farmaceuticoId!: number | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) farmaceuticoNombre!: string | null;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotal!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuento!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) montoCubierto!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) itbis!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total!: number;
  @Column({ type: 'varchar', length: 50, nullable: true }) metodoPago!: string | null;
  @Column({ type: 'int', nullable: true }) facturaId!: number | null;
  @Column({ length: 20, default: 'completada' }) estado!: string;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
