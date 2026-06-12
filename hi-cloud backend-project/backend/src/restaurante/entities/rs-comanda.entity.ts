import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_comandas')
export class RsComanda {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) numero: string;
  @Column() mesaId: number;
  @Column({ nullable: true }) meseroId: number;
  @Column({ nullable: true }) meseroNombre: string;
  @Column({ nullable: true }) clienteId: number;
  @Column({ default: 1 }) numPersonas: number;
  @Column({ default: () => 'NOW()' }) fechaApertura: Date;
  @Column({ nullable: true }) fechaCierre: Date;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotal: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuento: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) propina: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) itbis: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total: number;
  @Column({ default: 'abierta' }) estado: string;
  @Column({ nullable: true }) metodoPago: string;
  @Column({ nullable: true }) facturaId: number;
  @Column({ nullable: true }) notas: string;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
  @Column({ default: () => 'NOW()' }) updatedAt: Date;
}

@Entity('rs_comanda_items')
export class RsComandaItem {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() comandaId: number;
  @Column() menuItemId: number;
  @Column({ default: 1 }) cantidad: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precioUnitario: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) descuento: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true }) total: number;
  @Column({ type: 'jsonb', nullable: true }) modificaciones: any;
  @Column({ nullable: true }) notasEspeciales: string;
  @Column({ default: 'pendiente' }) estadoCocina: string;
  @Column({ nullable: true }) enviadoCocinaAt: Date;
  @Column({ nullable: true }) listoCocinaAt: Date;
  @Column({ nullable: true }) entregadoAt: Date;
  @Column({ default: 1 }) numeroRonda: number;
  @Column({ default: false }) cancelado: boolean;
  @Column({ nullable: true }) motivoCancelacion: string;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
