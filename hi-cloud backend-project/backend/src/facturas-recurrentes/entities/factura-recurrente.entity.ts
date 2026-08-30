import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { User } from '../../users/users.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

export enum Frecuencia {
  DIARIA   = 'diaria',
  SEMANAL  = 'semanal',
  MENSUAL  = 'mensual',
  ANUAL    = 'anual',
}

/**
 * Qué produce la plantilla cada ciclo.
 *
 * BORRADOR es lo que hacía siempre: una factura en borrador que alguien revisa
 * y emite a mano. ECF la emite sola, con comprobante fiscal, sin que nadie
 * toque nada — por eso todo lo que pueda salir mal se comprueba ANTES de pedir
 * el número (ver emitirConEcf en el servicio).
 */
export enum ModoEmision {
  BORRADOR = 'borrador',
  ECF      = 'ecf',
}

/**
 * Forma de pago con la que nace la factura generada.
 *
 * Los códigos son los de la DGII, los mismos que usa `facturas.formasPago` y
 * que lee el arqueo de caja: 1=Efectivo 2=Cheque/Transferencia 3=Tarjeta
 * 4=Crédito 5=Permuta 6=Nota de crédito. Se guarda el código y no un enum
 * propio para que la factura generada y la del POS hablen el mismo idioma.
 */
export enum FormaPago {
  EFECTIVO      = 1,
  TRANSFERENCIA = 2,
  TARJETA       = 3,
  CREDITO       = 4,
}

@TenantScoped()
@Entity('facturas_recurrentes')
@Index(['empresaId', 'isActive'])
@Index(['activa', 'proximaEjecucion'])
export class FacturaRecurrente extends TenantBaseEntity {
  @Column({ length: 200 })
  nombre!: string;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: 'clienteId' })
  cliente!: Cliente;

  @Column()
  clienteId!: number;

  @Column({ type: 'json' })
  detalles!: Array<{
    descripcion:    string;
    productoId?:    number;
    cantidad:       number;
    precioUnitario: number;
    porcentajeIva:  number;
  }>;

  // ── Cuándo ────────────────────────────────────────────────────────────────

  @Column({ type: 'enum', enum: Frecuencia, default: Frecuencia.MENSUAL })
  frecuencia!: Frecuencia;

  /**
   * Día del mes en que se genera, 1 a 31. Aplica a MENSUAL y ANUAL.
   *
   * 31 no significa "sáltate febrero": significa el ÚLTIMO día del mes. Un 31
   * elegido a propósito se respeta en enero y cae en el 28 (o 29) en febrero y
   * en el 30 en abril. Lo resuelve `diaDelMes()` y se dice en la interfaz.
   *
   * El campo anterior, `diaEjecucion`, sólo se miraba en la rama mensual y aun
   * ahí competía con la fecha de inicio: si empezabas un día 20 con día 5
   * elegido, la primera salía el 20. Ahora la fecha de inicio sólo decide a
   * partir de cuándo empieza a contar; el día lo manda este campo siempre.
   */
  @Column({ type: 'int', nullable: true })
  diaMes?: number;

  /** Día de la semana, 1=lunes a 7=domingo. Sólo aplica a SEMANAL. */
  @Column({ type: 'int', nullable: true })
  diaSemana?: number;

  /** A partir de cuándo empieza a contar. No decide el día: ver `diaMes`. */
  @Column({ type: 'date' })
  fechaInicio!: Date;

  @Column({ type: 'date' })
  proximaEjecucion!: Date;

  /**
   * Fecha (RD) de la última factura generada. Es la guarda de duplicado: si ya
   * vale hoy, no se genera otra, venga del cron o del botón de ejecutar ahora.
   * Se escribe en la MISMA transacción que la factura.
   */
  @Column({ type: 'date', nullable: true })
  ultimaEjecucion?: Date;

  @Column({ type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ type: 'int', default: 0 })
  totalGeneradas!: number;

  /**
   * Ciclos que pasaron sin generarse porque el servidor no corrió.
   *
   * Una caída de tres días genera UNA factura, no tres: tres comprobantes
   * fiscales de golpe por un fallo de infraestructura es peor que uno. Pero el
   * salto no puede ser silencioso — se cuenta aquí, se avisa al administrativo
   * y alguien decide si las atrasadas se emiten a mano.
   */
  @Column({ type: 'int', default: 0 })
  ciclosSaltados!: number;

  @Column({ default: true })
  activa!: boolean;

  // ── Qué emite ─────────────────────────────────────────────────────────────

  @Column({ type: 'varchar', length: 10, default: ModoEmision.BORRADOR })
  modoEmision!: ModoEmision;

  /** 'E31' | 'E32' | 'E41' | 'E44' | 'E45' … Sólo con modoEmision = 'ecf'. */
  @Column({ type: 'varchar', length: 4, nullable: true })
  tipoEcf?: string;

  // ── Cómo se paga ──────────────────────────────────────────────────────────

  @Column({ type: 'int', default: FormaPago.EFECTIVO })
  formaPago!: number;

  /** Plazo en días. Sólo tiene sentido con formaPago = 4 (crédito). */
  @Column({ type: 'int', default: 0 })
  diasCredito!: number;

  // ── Correo ────────────────────────────────────────────────────────────────

  /** Enviar la factura al cliente al generarse. La empresa puede apagarlo todo. */
  @Column({ default: true })
  emailCliente!: boolean;

  /**
   * Días de antelación con que se avisa de lo que va a salir. 0 = sin aviso.
   * Con e-CF automático, saber qué se va a emitir antes de que pase vale mucho.
   */
  @Column({ type: 'int', default: 0 })
  avisoPrevioDias!: number;

  /** Fecha de generación para la que ya se mandó el aviso — evita repetirlo. */
  @Column({ type: 'date', nullable: true })
  avisoPrevioEnviadoPara?: Date;

  // ── Diagnóstico ───────────────────────────────────────────────────────────

  /**
   * Por qué falló el último ciclo, en palabras. Cuando la emisión con e-CF no
   * pasa las comprobaciones previas, la factura queda en BORRADOR y el motivo
   * se escribe aquí y en las notas de la factura — nunca se quema secuencia ni
   * se pierde la razón.
   */
  @Column({ type: 'text', nullable: true })
  ultimoError?: string;

  @Column({ type: 'timestamp', nullable: true })
  ultimoErrorAt?: Date;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  /**
   * Dueño de la plantilla. NOT NULL, y es de quien se deriva el vendedor de
   * cada factura generada: en una recurrente sí es quien vendió el contrato, a
   * diferencia de otros crones donde no hay a quién imputar.
   */
  @Column()
  userId!: number;
}
