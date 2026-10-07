import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type NivelTarjetaSupervisor = 'solo_tarjeta' | 'tarjeta_pin';

/**
 * Nivel de seguridad de la autorización por tarjeta, UNA fila por empresa —
 * independiente de las políticas por clave (supervisor_politicas, que
 * siguen decidiendo QUÉ pestañas/acciones piden supervisor y si vale con la
 * sesión de 8h o exige una autorización nueva cada vez). Esto decide CÓMO
 * se valida la tarjeta una vez que una política ya exige supervisor:
 *   - 'solo_tarjeta' (default): el escaneo solo basta.
 *   - 'tarjeta_pin': después de escanear, pide también el PIN de esa misma persona.
 */
@Entity('supervisor_tarjeta_config')
export class SupervisorTarjetaConfig {
  @PrimaryColumn()
  empresaId!: number;

  @Column({ type: 'varchar', length: 20, default: 'solo_tarjeta' })
  nivel!: NivelTarjetaSupervisor;

  @Column({ type: 'int', nullable: true })
  actualizadoPor?: number | null;

  @UpdateDateColumn({ name: 'actualizadoEn' })
  actualizadoEn!: Date;
}
