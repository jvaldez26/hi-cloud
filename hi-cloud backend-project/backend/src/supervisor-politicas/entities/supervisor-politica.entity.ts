import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

export type ModoSupervisor = 'sesion' | 'cada_vez';

@Entity('supervisor_politicas')
@Unique(['empresaId', 'clave'])
@Index(['empresaId'])
export class SupervisorPolitica {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  /** Clave del catálogo — ver supervisor-catalogo.ts (única fuente de las claves válidas). */
  @Column({ length: 60 })
  clave!: string;

  @Column({ default: false })
  requerido!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'sesion' })
  modo!: ModoSupervisor;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  updatedAt!: Date;
}
