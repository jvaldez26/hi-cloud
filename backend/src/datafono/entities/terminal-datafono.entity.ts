import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('terminales_datafono')
export class TerminalDatafono {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 30 })
  numeroTerminal: string;

  @Column({ length: 100 })
  banco: string;

  @Column({ length: 50, default: 'all' })
  tipoTarjeta: string; // visa, mastercard, amex, all

  @Column({ length: 100, nullable: true })
  sucursal?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 3.5 })
  comisionPct: number;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
