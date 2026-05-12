import { Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Extiende BaseEntity agregando aislamiento por empresa (multi-tenant).
 * Todas las entidades operacionales deben extender esta clase.
 */
export abstract class TenantBaseEntity extends BaseEntity {
  @Index()
  @Column({ nullable: true })
  empresaId!: number;
}
