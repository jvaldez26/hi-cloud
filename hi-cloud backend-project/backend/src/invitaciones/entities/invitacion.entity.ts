import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserRole } from '../../users/enums/user-role.enum';

export enum EstadoInvitacion {
  PENDIENTE = 'pendiente',
  ACEPTADA  = 'aceptada',
  EXPIRADA  = 'expirada',
  CANCELADA = 'cancelada',
}

@Entity('invitaciones')
export class Invitacion extends BaseEntity {
  @Column({ length: 100 })
  email!: string;

  @Column({ length: 100, unique: true })
  token!: string;

  @Column()
  empresaId!: number;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  rol!: UserRole;

  @Column({ type: 'enum', enum: EstadoInvitacion, default: EstadoInvitacion.PENDIENTE })
  estado!: EstadoInvitacion;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column()
  invitadoPorId!: number;

  @Column({ length: 200, nullable: true })
  nombreEmpresa?: string;

  @Column({ length: 100, nullable: true })
  nombreInvitador?: string;
}
