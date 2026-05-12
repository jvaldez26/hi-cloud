import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum TipoConfiguracion {
  STRING  = 'string',
  NUMBER  = 'number',
  BOOLEAN = 'boolean',
  JSON    = 'json',
}

@Entity('configuraciones_sistema')
export class ConfiguracionSistema extends BaseEntity {
  @Column({ length: 80, unique: true })
  clave!: string;

  @Column({ type: 'text' })
  valor!: string;

  @Column({ type: 'enum', enum: TipoConfiguracion, default: TipoConfiguracion.STRING })
  tipo!: TipoConfiguracion;

  @Column({ length: 50 })
  grupo!: string;

  @Column({ length: 300 })
  descripcion!: string;

  @Column({ default: true })
  editable!: boolean;
}
