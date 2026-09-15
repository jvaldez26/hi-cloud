import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('empresa_modulos')
export class EmpresaModulo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 50 })
  moduloCodigo!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  fechaActivacion!: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaVencimiento!: Date | null;

  @Column({ type: 'int', nullable: true })
  activadoPor!: number | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  /** 'manual' (Super Admin) | 'registro' (el usuario lo eligió al crear su cuenta) */
  @Column({ length: 20, default: 'manual' })
  origen!: string;

  /** true si fue una activación de cortesía (no una contratación pagada) */
  @Column({ default: false })
  esCortesia!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
