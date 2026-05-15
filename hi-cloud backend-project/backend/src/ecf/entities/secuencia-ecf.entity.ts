import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoECF } from './tipo-ecf.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

@TenantScoped()
@Entity('secuencias_ecf')
@Index(['empresaId', 'tipoECFId', 'isActiva'])
export class SecuenciaECF extends BaseEntity {
  @Column({ nullable: true })
  empresaId?: number;

  @ManyToOne(() => TipoECF, { eager: true })
  @JoinColumn({ name: 'tipoECFId' })
  tipoECF!: TipoECF;

  @Column()
  tipoECFId!: number;

  @Column({ type: 'int' })
  secuenciaInicial!: number;

  @Column({ type: 'int' })
  secuenciaFinal!: number;

  @Column({ type: 'int' })
  secuenciaActual!: number;

  @Column({ type: 'date' })
  fechaVencimiento!: Date;

  @Column({ default: false })
  isAgotada!: boolean;

  @Column({ default: true })
  isActiva!: boolean;

  @Column({ default: false })
  alertaEnviada!: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;
}
