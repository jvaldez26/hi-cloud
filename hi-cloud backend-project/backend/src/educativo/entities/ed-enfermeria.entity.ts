import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_enfermeria')
export class EdEnfermeria {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() estudianteId!: number;
  @Column({ type: 'timestamp' }) fecha!: Date;
  @Column({ type: 'text' }) motivo!: string;
  @Column({ type: 'text', nullable: true }) sintomas?: string;
  @Column({ type: 'text', nullable: true }) atencionBrindada?: string;
  @Column({ length: 200, nullable: true }) medicamentoDado?: string;
  @Column({ default: false }) padresNotificados!: boolean;
  @Column({ default: false }) enviadoCasa!: boolean;
  @Column({ length: 200, nullable: true }) atendidoPor?: string;
  @CreateDateColumn() createdAt!: Date;
}
