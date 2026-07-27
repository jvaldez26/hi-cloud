import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ed_biblioteca_libros')
export class EdLibro {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 50, nullable: true }) codigo?: string;
  @Column({ length: 50, nullable: true }) isbn?: string;
  @Column({ length: 300 }) titulo!: string;
  @Column({ length: 200, nullable: true }) autor?: string;
  @Column({ length: 150, nullable: true }) editorial?: string;
  @Column({ length: 100, nullable: true }) categoria?: string;
  @Column({ default: 1 }) cantidadTotal!: number;
  @Column({ default: 1 }) cantidadDisponible!: number;
  @Column({ length: 100, nullable: true }) ubicacion?: string;
  @Column({ default: true }) isActive!: boolean;
}
