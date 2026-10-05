import { Entity, Column, PrimaryGeneratedColumn, Unique, Index } from 'typeorm';

/**
 * Una fila por (empresa, usuario, tipo de alerta) — a diferencia de los
 * eventos (notificaciones_enviadas, una fila POR aviso), las alertas de
 * AlertasSistemaService son un CONTEO en vivo, no hay "la alerta #123" que
 * marcar leída. Lo que se guarda es la "huella" del estado que el usuario ya
 * vio (ver huellaAlerta() en notificaciones-centro.service.ts) — mientras la
 * huella actual coincida con la guardada, la alerta no vuelve a contar en el
 * número rojo; si cambia (entran productos nuevos en stock bajo, etc.)
 * vuelve a contar aunque siga "vista", sin que el usuario tenga que hacer
 * nada — así es como se evita que una alerta vista esconda un problema nuevo.
 */
@Entity('alertas_vistas')
@Unique(['empresaId', 'userId', 'tipo'])
export class AlertaVista {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  empresaId!: number;

  @Index()
  @Column()
  userId!: number;

  @Column({ length: 50 })
  tipo!: string;

  @Column({ type: 'text' })
  huella!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  vistoHasta!: Date;

  /** "Posponer 1 día" — no cuenta hasta esta fecha, salvo que la huella cambie antes. */
  @Column({ type: 'timestamptz', nullable: true })
  pospuestoHasta?: Date;
}
