import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Empresa } from '../../configuracion/entities/empresa.entity';
import { ModuloAddon } from './modulo-addon.entity';

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

  @Column({ nullable: true })
  activadoPor!: number | null;

  @Column({ type: 'text', nullable: true })
  notas!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresaId' })
  empresa!: Empresa;

  @ManyToOne(() => ModuloAddon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moduloCodigo', referencedColumnName: 'codigo' })
  modulo!: ModuloAddon;
}
