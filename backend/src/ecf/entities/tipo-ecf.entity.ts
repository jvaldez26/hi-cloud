import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('tipos_ecf')
export class TipoECF extends BaseEntity {
  @Column({ length: 3, unique: true })
  codigo!: string;

  @Column({ length: 200 })
  descripcion!: string;

  @Column({ length: 3 })
  prefijo!: string;

  @Column({ default: false })
  requiereRNC!: boolean;

  @Column({ default: true })
  aplicaITBIS!: boolean;
}
