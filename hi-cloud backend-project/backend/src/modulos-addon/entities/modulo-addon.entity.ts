import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('modulos_addon')
export class ModuloAddon {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 50 })
  codigo!: string;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion!: string;

  @Column({ default: true })
  isActive!: boolean;

  /**
   * Si true, elegir este sector en el registro activa el add-on
   * automáticamente. Configurable por add-on desde Super Admin — hoy todos
   * en automático; se puede pasar uno a manual sin tocar código.
   */
  @Column({ default: true })
  activacionAutomatica!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
