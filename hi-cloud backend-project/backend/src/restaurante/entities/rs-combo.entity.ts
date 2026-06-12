import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_combos')
export class RsCombo {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() nombre: string;
  @Column({ nullable: true }) descripcion: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precio: number;
  @Column({ nullable: true }) imagenUrl: string;
  @Column({ default: true }) isActive: boolean;
}

@Entity('rs_combo_items')
export class RsComboItem {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() comboId: number;
  @Column() menuItemId: number;
  @Column({ default: 1 }) cantidad: number;
  @Column({ default: false }) esOpcional: boolean;
}
