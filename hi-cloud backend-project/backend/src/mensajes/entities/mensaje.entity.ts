import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/users.entity';
import { MensajeLectura } from './mensaje-lectura.entity';

export type MensajeTipo        = 'aviso' | 'novedad';
export type MensajeDestinatario = 'todas' | 'lista' | 'plan';

@Entity('mensajes')
export class Mensaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  titulo: string;

  @Column({ type: 'text' })
  cuerpo: string;

  /** 'aviso' para comunicados operativos; 'novedad' para actualizaciones del producto */
  @Column({ length: 10 })
  tipo: MensajeTipo;

  /** 'todas' | 'lista' (empresaIds) | 'plan' (slug del plan) */
  @Column({ length: 10 })
  destinatario: MensajeDestinatario;

  /** Cuando destinatario='lista', lista de empresaIds destinatarias */
  @Column({ type: 'int', array: true, nullable: true })
  destinatarioIds: number[] | null;

  /**
   * Cuando destinatario='plan', slug del plan.
   * Valores activos: emprendedor | pyme | pro | plus
   * NOTA: suscripciones.plan es un ENUM de PostgreSQL (suscripciones_plan_enum).
   * Al comparar este campo contra él en SQL crudo, usar ::text explícito.
   */
  @Column({ length: 50, nullable: true })
  destinatarioPlan: string | null;

  /** Puede ser futura (mensaje programado) */
  @Column({ type: 'timestamp' })
  fechaPublicacion: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaExpiracion: Date | null;

  @Column({ default: true })
  activo: boolean;

  /** Fecha de la última edición post-publicación */
  @Column({ type: 'timestamp', nullable: true })
  editadoEn: Date | null;

  @Column()
  createdBy: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'createdBy' })
  autor: User;

  @OneToMany(() => MensajeLectura, l => l.mensaje)
  lecturas: MensajeLectura[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
