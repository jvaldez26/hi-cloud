import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/users.entity';
import { Empresa } from '../../configuracion/entities/empresa.entity';
import { UserRole } from '../../users/enums/user-role.enum';

@Entity('usuario_empresa')
export class UsuarioEmpresa extends BaseEntity {
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @ManyToOne(() => Empresa)
  @JoinColumn({ name: 'empresaId' })
  empresa!: Empresa;

  @Column()
  empresaId!: number;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  rol!: UserRole;

  @Column({ default: false })
  isPrincipal!: boolean;

  /** Sucursal asignada al usuario dentro de esta empresa */
  @Column({ nullable: true })
  sucursalId?: number;
}
