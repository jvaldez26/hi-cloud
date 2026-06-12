import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_pedidos_delivery')
export class RsPedidoDelivery {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) numero: string;
  @Column() clienteNombre: string;
  @Column() clienteTelefono: string;
  @Column({ nullable: true }) clienteEmail: string;
  @Column({ nullable: true }) clienteId: number;
  @Column() direccionEntrega: string;
  @Column({ nullable: true }) referenciasDireccion: string;
  @Column({ default: () => 'NOW()' }) fechaPedido: Date;
  @Column({ nullable: true }) fechaEstimadaEntrega: Date;
  @Column({ nullable: true }) fechaEntregaReal: Date;
  @Column({ nullable: true }) repartidorNombre: string;
  @Column({ nullable: true }) repartidorTelefono: string;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) subtotal: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) costoEnvio: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) descuento: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) itbis: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) total: number;
  @Column({ default: 'recibido' }) estado: string;
  @Column({ nullable: true }) metodoPago: string;
  @Column({ default: false }) pagadoOnline: boolean;
  @Column({ nullable: true }) comandaId: number;
  @Column({ nullable: true }) facturaId: number;
  @Column({ nullable: true }) notas: string;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
