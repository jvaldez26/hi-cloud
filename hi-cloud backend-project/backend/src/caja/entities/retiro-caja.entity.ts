import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('retiros_caja')
export class RetiroCaja {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column()
  cajaDiariaId!: number;

  @Column()
  usuarioId!: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  usuarioNombre?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  monto!: number;

  @Column({ type: 'varchar', length: 300 })
  descripcion!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
