import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type BackupTipo   = 'daily' | 'weekly' | 'monthly' | 'manual';
export type BackupEstado = 'EXITOSO' | 'FALLIDO' | 'EN_PROGRESO';

@Entity('backup_registros')
@Index(['estado', 'createdAt'])
export class BackupRegistro {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 10, default: 'daily' })
  tipo!: BackupTipo;

  @Column({ type: 'varchar', length: 20, default: 'EN_PROGRESO' })
  estado!: BackupEstado;

  @Column({ length: 300, nullable: true })
  s3Key?: string;

  @Column({ length: 20, nullable: true })
  tamanio?: string;

  @Column({ type: 'int', nullable: true })
  duracionSegundos?: number;

  @Column({ length: 64, nullable: true })
  checksum?: string;

  @Column({ type: 'text', nullable: true })
  errorMensaje?: string;

  @Column({ default: false })
  integridadVerificada!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verificadoEn?: Date;

  @Column({ nullable: true })
  iniciadoPor?: number;  // userId si fue manual

  @CreateDateColumn()
  createdAt!: Date;
}
