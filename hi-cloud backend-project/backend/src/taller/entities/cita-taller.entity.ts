import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tm_citas')
export class CitaTaller {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ type: 'varchar', length: 20, nullable: true }) numero!: string | null;
  @Column({ type: 'int', nullable: true }) vehiculoId!: number | null;
  @Column({ type: 'int', nullable: true }) clienteId!: number | null;
  @Column({ type: 'int', nullable: true }) tecnicoId!: number | null;
  @Column({ type: 'date' }) fecha!: string;
  @Column({ type: 'time' }) hora!: string;
  @Column({ default: 60 }) duracionMinutos!: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) tipoServicio!: string | null;
  @Column({ type: 'text', nullable: true }) descripcion!: string | null;
  @Column({ length: 20, default: 'programada' }) estado!: string;
  @Column({ default: false }) recordatorioEnviado!: boolean;
  @Column({ type: 'text', nullable: true }) notas!: string | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
