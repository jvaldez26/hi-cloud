import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('rs_modificadores')
export class RsModificador {
  @PrimaryGeneratedColumn() id: number;
  @Column() empresaId: number;
  @Column({ nullable: true }) menuItemId: number;
  @Column() nombre: string;
  @Column({ default: 'opcional' }) tipo: string;
  @Column({ type: 'jsonb', nullable: true }) opciones: any;
  @Column({ default: true }) isActive: boolean;
}
