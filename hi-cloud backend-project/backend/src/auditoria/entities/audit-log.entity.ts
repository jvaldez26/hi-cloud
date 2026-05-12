import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AccionAuditoria {
  CREATE = 'create',
  READ   = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN  = 'login',
  LOGOUT = 'logout',
  EXPORT = 'export',
  ERROR  = 'error',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ nullable: true })
  userId?: number;

  @Column({ length: 100, nullable: true })
  userName?: string;

  @Column({ length: 30, nullable: true })
  userRole?: string;

  @Column({ type: 'enum', enum: AccionAuditoria })
  accion!: AccionAuditoria;

  @Index()
  @Column({ length: 50 })
  modulo!: string;

  @Column({ length: 100, nullable: true })
  entidad?: string;

  @Column({ length: 50, nullable: true })
  entidadId?: string;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ type: 'text', nullable: true })
  valorAnterior?: string;

  @Column({ type: 'text', nullable: true })
  valorNuevo?: string;

  @Column({ length: 8 })
  metodo!: string;

  @Column({ length: 300 })
  ruta!: string;

  @Column({ type: 'int', nullable: true })
  statusCode?: number;

  @Column({ type: 'int', nullable: true })
  duracionMs?: number;

  @Column({ default: true })
  exitoso!: boolean;

  @Column({ length: 50, nullable: true })
  ipAddress?: string;

  @Column({ length: 300, nullable: true })
  userAgent?: string;

  @Index()
  @Column({ nullable: true })
  empresaId?: number;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
