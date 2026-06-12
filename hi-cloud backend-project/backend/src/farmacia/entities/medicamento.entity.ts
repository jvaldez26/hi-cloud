import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('fa_medicamentos')
export class Medicamento {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 50, nullable: true }) codigo!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) codigoBarra!: string | null;
  @Column({ length: 200 }) nombreGenerico!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) nombreComercial!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) laboratorio!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) categoria!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) forma!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) concentracion!: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) via!: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) unidadMedida!: string | null;
  @Column({ default: false }) requiereReceta!: boolean;
  @Column({ default: false }) esNarcotico!: boolean;
  @Column({ default: false }) esPsicotropico!: boolean;
  @Column({ default: false }) esRefrigerado!: boolean;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioCompra!: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 }) precioVenta!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioArs!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) margenGanancia!: number | null;
  @Column({ default: 10 }) stockMinimo!: number;
  @Column({ type: 'int', nullable: true }) stockMaximo!: number | null;
  @Column({ default: 0 }) stockActual!: number;
  @Column({ type: 'int', nullable: true }) productoId!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
