import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum EstadoDemo {
  NUEVO           = 'nuevo',
  CONTACTADO      = 'contactado',
  DEMO_AGENDADA   = 'demo_agendada',
  DEMO_REALIZADA  = 'demo_realizada',
  CONVERTIDO      = 'convertido',
  DESCARTADO      = 'descartado',
}

export interface NotaDemo {
  texto:       string;
  autorId?:    number;
  autorNombre: string;
  fecha:       string;   // ISO 8601
}

export enum TamanoEmpresa {
  MICRO   = '1-5',
  PEQUENA = '6-20',
  MEDIANA = '21-100',
  GRANDE  = '100+',
}

@Entity('demo_requests')
export class DemoRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 200 })
  empresa!: string;

  @Index()
  @Column({ length: 150 })
  email!: string;

  @Column({ length: 25 })
  telefono!: string;

  @Column({ length: 50, default: 'República Dominicana' })
  pais!: string;

  @Column({ type: 'enum', enum: TamanoEmpresa, default: TamanoEmpresa.MICRO })
  tamanoEmpresa!: TamanoEmpresa;

  @Column({ type: 'simple-array', nullable: true })
  modulosInteres?: string[];

  @Column({ type: 'text', nullable: true })
  mensaje?: string;

  @Column({ type: 'enum', enum: EstadoDemo, default: EstadoDemo.NUEVO })
  estado!: EstadoDemo;

  /** Notas internas como texto plano (legado) */
  @Column({ type: 'text', nullable: true })
  notasInternas?: string;

  /** Historial de notas estructuradas con autor y fecha */
  @Column({ type: 'jsonb', default: '[]' })
  notas!: NotaDemo[];

  @Column({ nullable: true })
  asignadoA?: string;

  /** userId del super_admin que gestiona esta solicitud */
  @Column({ nullable: true })
  atendidoPor?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
