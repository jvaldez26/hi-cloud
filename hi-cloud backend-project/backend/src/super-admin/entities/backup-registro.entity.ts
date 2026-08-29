import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type BackupTipo   = 'daily' | 'weekly' | 'monthly' | 'manual';
export type BackupEstado = 'EXITOSO' | 'FALLIDO' | 'EN_PROGRESO';

@Entity('backup_registros')
@Index(['estado', 'createdAt'])
export class BackupRegistro {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 10, default: 'daily' })
  tipo!: BackupTipo;

  /**
   * SIN DEFAULT A PROPOSITO. Quien inserte, que diga en que estado.
   *
   * Estaba declarado `default: 'EN_PROGRESO'`. Los tres sitios que insertan lo
   * fijan siempre, asi que no lo usaba nadie — pero dejaba puesta la trampa
   * para el siguiente INSERT: omitir `estado` creaba una fila ABIERTA sin que
   * saltara nada.
   *
   * Y abierta no es inocuo: `cerrarColgados()` la cierra como FALLIDO a los 30
   * minutos con el motivo "reporte no recibido", y eso entra en la tasa de
   * exito del panel. Un respaldo que nunca existio pasa a contar como un
   * respaldo que fallo. Es justo lo que hacia el boton manual antes de que
   * `registrarExito` aprendiera a cerrar su propia fila.
   *
   * Ahora el olvido revienta con NOT NULL en el sitio y en el momento, en vez
   * de convertirse en una metrica sucia que alguien mira meses despues.
   * Ver migracion QuitarDefaultEstadoBackups1761500000000.
   */
  @Column({ type: 'varchar', length: 20 })
  estado!: BackupEstado;

  @Column({ length: 300, nullable: true })
  s3Key?: string;

  @Column({ length: 20, nullable: true })
  tamanio?: string;

  @Column({ type: 'int', nullable: true })
  duracionSegundos?: number;

  @Column({ length: 64, nullable: true })
  checksum?: string;

  @Column({ type: 'text', nullable: true })
  errorMensaje?: string;

  /**
   * SOLO true si el dump se restauro de verdad en una base temporal y los
   * conteos cuadraron. Nunca se levanta por el hecho de que el backup se creara
   * sin error: que pg_dump termine no dice nada de si el archivo sirve.
   */
  @Column({ default: false })
  integridadVerificada!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  verificadoEn?: Date;

  /** Cuando se restauro por ultima vez para probarlo. NULL = nunca. */
  @Column({ type: 'timestamptz', nullable: true })
  restauracionProbadaEn?: Date | null;

  /**
   * Conteos leidos DEL DUMP RESTAURADO, por tabla, junto al de produccion en
   * ese momento. Se guardan los dos a proposito: entre que se toma el dump y
   * que se verifica pasan minutos y produccion sigue facturando, asi que una
   * diferencia pequeña es normal. Guardar solo uno obligaria a adivinar.
   *
   *   { "facturas": { "restaurado": 5780, "produccion": 5782 }, ... }
   */
  @Column({ type: 'jsonb', nullable: true })
  filasVerificadas?: Record<string, { restaurado: number; produccion: number }> | null;

  /**
   * Que paso en la verificacion. Se guarda TAMBIEN cuando salio bien.
   *
   * Antes solo se rellenaba en el fallo y en el exito se escribia null. Eso
   * tiraba el detalle (duracion, sha256 contrastado) justo en el caso en que
   * sirve para ver una tendencia: lo que avisa de que algo se degrada no es el
   * primer fallo, es que el tiempo empiece a subir semanas antes.
   */
  @Column({ type: 'text', nullable: true })
  verificacionMensaje?: string | null;

  /**
   * Cuanto tardo la verificacion completa (bajar de S3 + checksum + restaurar +
   * contar), en segundos. Se guarda en exito Y en fallo — un fallo lento y uno
   * inmediato tienen causas distintas.
   */
  @Column({ type: 'int', nullable: true })
  verificacionSegundos?: number | null;

  @Column({ nullable: true })
  iniciadoPor?: number;  // userId si fue manual

  @CreateDateColumn()
  createdAt!: Date;
}
