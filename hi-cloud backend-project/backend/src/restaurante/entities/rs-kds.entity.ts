import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_kds_estaciones')
export class RsKdsEstacion {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column() nombre: string;
  @Column({ type: 'jsonb', nullable: true }) categorias: any;
  @Column({ default: true }) isActive: boolean;
}
