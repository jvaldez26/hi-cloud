import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_menu_items')
export class RsMenuItem {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) categoriaId: number;
  @Column({ nullable: true }) codigo: string;
  @Column() nombre: string;
  @Column({ nullable: true }) descripcion: string;
  @Column({ nullable: true }) imagenUrl: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precio: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioEspecial: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) costo: number;
  @Column({ default: 15 }) tiempoPreparacionMin: number;
  @Column({ default: true }) disponible: boolean;
  @Column({ default: true }) disponibleParaDelivery: boolean;
  @Column({ default: true }) disponibleParaLlevar: boolean;
  @Column({ default: false }) controlStock: boolean;
  @Column({ nullable: true }) stockActual: number;
  @Column({ nullable: true }) productoId: number;
  @Column({ nullable: true }) calorias: number;
  @Column({ nullable: true }) alergenos: string;
  @Column({ default: false }) esVegetariano: boolean;
  @Column({ default: false }) esVegano: boolean;
  @Column({ default: false }) esGlutenFree: boolean;
  @Column({ default: true }) permiteModificaciones: boolean;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: () => 'NOW()' }) createdAt: Date;
}
