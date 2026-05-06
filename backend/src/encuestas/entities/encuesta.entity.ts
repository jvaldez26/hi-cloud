import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('encuestas')
export class Encuesta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  titulo: string;

  @Column({ length: 20, default: 'nps' })
  tipo: string; // nps, csat, custom

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'jsonb', default: '[]' })
  preguntas: Array<{ id: string; texto: string; tipo: string; opciones?: string[] }>;

  @Column({ default: true })
  activa: boolean;

  @Column({ length: 60, unique: true, nullable: true })
  tokenPublico?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
