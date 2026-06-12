import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_catalogo_servicios')
export class CatalogoServicio {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombre!: string;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) categoria!: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) precioBase!: number | null;
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true }) horasEstimadas!: number | null;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
