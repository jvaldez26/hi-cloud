import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum EstadoDemo {
  NUEVO           = 'nuevo',
  CONTACTADO      = 'contactado',
  DEMO_AGENDADA   = 'demo_agendada',
  CONVERTIDO      = 'convertido',
  DESCARTADO      = 'descartado',
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

  @Column({ type: 'text', nullable: true })
  notasInternas?: string;

  @Column({ nullable: true })
  asignadoA?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
