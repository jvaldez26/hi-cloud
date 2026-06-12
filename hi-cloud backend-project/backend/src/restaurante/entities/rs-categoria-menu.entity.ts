import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_categorias_menu')
export class RsCategoriaMenu {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() nombre: string;
  @Column({ nullable: true }) descripcion: string;
  @Column({ nullable: true }) icono: string;
  @Column({ nullable: true }) color: string;
  @Column({ default: 0 }) orden: number;
  @Column({ nullable: true, type: 'time' }) disponibleDesde: string;
  @Column({ nullable: true, type: 'time' }) disponibleHasta: string;
  @Column({ default: true }) isActive: boolean;
}
