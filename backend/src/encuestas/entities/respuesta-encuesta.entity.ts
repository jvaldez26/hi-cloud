import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('respuestas_encuesta')
export class RespuestaEncuesta {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Column()
  encuestaId: number;

  @Column({ nullable: true })
  clienteId?: number;

  @Column({ length: 200, nullable: true })
  nombreRespondente?: string;

  @Column({ type: 'int', nullable: true })
  puntuacion?: number;

  @Column({ type: 'jsonb', default: '{}' })
  respuestas: Record<string, string | number>;

  @Column({ type: 'text', nullable: true })
  comentarios?: string;

  @CreateDateColumn()
  createdAt: Date;
}
