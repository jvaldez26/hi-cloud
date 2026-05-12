import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { UserRole } from './enums/user-role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @Column({ unique: true, length: 150 })
  email!: string;

  @Column({ select: false })
  password!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role!: UserRole;

  @Column({ length: 100, nullable: true, select: false })
  resetPasswordToken?: string;

  @Column({ type: 'timestamp', nullable: true, select: false })
  resetPasswordExpires?: Date;

  @Column({ default: false })
  twoFactorEnabled!: boolean;

  @Column({ length: 100, nullable: true, select: false })
  twoFactorSecret?: string;
}
