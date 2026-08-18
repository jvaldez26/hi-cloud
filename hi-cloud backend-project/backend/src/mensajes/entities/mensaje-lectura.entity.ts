import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User }    from '../../users/users.entity';
import { Mensaje } from './mensaje.entity';

@Entity('mensajes_lectura')
@Unique(['mensajeId', 'usuarioId'])
export class MensajeLectura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  mensajeId: string;

  @ManyToOne(() => Mensaje, m => m.lecturas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mensajeId' })
  mensaje: Mensaje;

  @Column()
  usuarioId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuarioId' })
  usuario: User;

  /** Toast mostrado — no implica que el usuario lo haya leído */
  @Column({ type: 'timestamp', nullable: true })
  vistoEn: Date | null;

  /** Usuario abrió el mensaje en la bandeja */
  @Column({ type: 'timestamp', nullable: true })
  leidoEn: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  archivadoEn: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
