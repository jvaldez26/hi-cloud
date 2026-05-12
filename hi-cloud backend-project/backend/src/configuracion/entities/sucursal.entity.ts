import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Empresa } from './empresa.entity';
import { User } from '../../users/users.entity';

@Entity('sucursales')
@Unique('UQ_sucursal_codigo_empresa', ['codigo', 'empresaId'])
export class Sucursal extends TenantBaseEntity {
  @ManyToOne(() => Empresa, { eager: false })
  @JoinColumn({ name: 'empresaId' })
  empresa!: Empresa;

  @Column({ length: 10 })
  codigo!: string;

  @Column({ length: 100 })
  nombre!: string;

  @Column({ length: 400, nullable: true })
  direccion?: string;

  @Column({ length: 100, nullable: true })
  ciudad?: string;

  @Column({ length: 20, nullable: true })
  telefono?: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ default: false })
  esPrincipal!: boolean;

  @Column({ nullable: true })
  responsableId?: number;

  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User;

  @Column({ type: 'text', nullable: true })
  notas?: string;
}
