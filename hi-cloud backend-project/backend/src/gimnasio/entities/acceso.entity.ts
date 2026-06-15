import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('gm_accesos')
export class Acceso {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() miembroId!: number;
  @Column({ nullable: true }) membresiaId?: number;
  @Column({ default: 'entrada' }) tipo!: string;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fechaHora!: Date;
  @Column({ length: 50, nullable: true }) metodo?: string;
  @Column({ default: true }) autorizado!: boolean;
  @Column({ length: 200, nullable: true }) motivoRechazo?: string;
  @CreateDateColumn() createdAt!: Date;
}
