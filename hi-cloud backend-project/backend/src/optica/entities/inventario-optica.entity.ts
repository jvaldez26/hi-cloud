import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('op_inventario')
export class InventarioOptica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  empresaId!: number;

  @Column({ type: 'varchar', length: 20 })
  tipo!: string; // montura | lente_contacto | accesorio

  @Column({ type: 'varchar', length: 50, nullable: true })
  codigo!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  marca!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  modelo!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  material!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  genero!: string | null; // masculino | femenino | unisex

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precio!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costo!: number;

  @Column({ type: 'int', default: 0 })
  stockActual!: number;

  @Column({ type: 'int', default: 5 })
  stockMinimo!: number;

  @Column({ type: 'text', nullable: true })
  descripcion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
