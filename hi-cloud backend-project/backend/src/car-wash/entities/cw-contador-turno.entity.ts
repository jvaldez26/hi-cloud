import { Entity, PrimaryColumn, Column } from 'typeorm';

/** Solo para registrar la tabla en TypeORM (migraciones, metadata) — el
 *  incremento atómico se hace con SQL parametrizado vía `DataSource.query`
 *  (INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING), no con el
 *  repositorio: es la única forma de que el incremento sea una sola
 *  sentencia atómica bajo concurrencia. */
@Entity('cw_contador_turno')
export class CwContadorTurno {
  @PrimaryColumn() empresaId!: number;
  @PrimaryColumn() sucursalId!: number;
  @PrimaryColumn({ type: 'date' }) fechaRD!: string;

  @Column({ default: 0 }) ultimo!: number;
}
