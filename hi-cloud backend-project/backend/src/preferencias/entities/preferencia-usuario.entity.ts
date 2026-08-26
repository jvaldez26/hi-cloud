import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Una preferencia de UN usuario dentro de UNA empresa.
 *
 * Clave/valor a proposito: la primera es 'dashboard.widgets', y la siguiente que
 * pidan (columnas de una tabla, filtro por defecto, orden) entra sin migracion.
 *
 * Ver la migracion 1761200000000 para por que la clave lleva empresaId y por que
 * es NOT NULL.
 */
@Entity('preferencias_usuario')
// Declarativo: el indice unico real lo crea la migracion como CONSTRAINT
// uq_pref_usuario_clave. Con synchronize:false TypeORM no crea nada, asi que no
// hay riesgo de acabar con dos indices sobre las mismas columnas.
@Index(['userId', 'empresaId', 'clave'], { unique: true })
export class PreferenciaUsuario extends BaseEntity {
  @Column()
  userId!: number;

  @Column()
  empresaId!: number;

  @Column({ length: 80 })
  clave!: string;

  @Column({ type: 'jsonb' })
  valor!: unknown;
}
