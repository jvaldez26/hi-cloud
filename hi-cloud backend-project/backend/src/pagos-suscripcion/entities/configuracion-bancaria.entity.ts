import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('configuracion_bancaria')
export class ConfiguracionBancaria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  banco: string;

  @Column({ type: 'varchar', length: 50 })
  numeroCuenta: string;

  @Column({ type: 'varchar', length: 20, default: 'corriente' })
  tipoCuenta: string;

  @Column({ type: 'varchar', length: 255 })
  titular: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rnc: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creadoEn' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizadoEn' })
  actualizadoEn: Date;
}
