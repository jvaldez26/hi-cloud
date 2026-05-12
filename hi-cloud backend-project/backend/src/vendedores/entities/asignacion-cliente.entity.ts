import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';

@Entity('vendedor_clientes')
@Index(['empresaId', 'vendedorId'])
@Index(['empresaId', 'clienteId'])
export class AsignacionClienteVendedor extends TenantBaseEntity {
  @Column()
  vendedorId!: number;

  @Column()
  clienteId!: number;

  @Column({ type: 'date' })
  fechaAsignacion!: Date;
}
