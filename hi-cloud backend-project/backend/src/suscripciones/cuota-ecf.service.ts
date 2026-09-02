import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PLANES, PlanTipo } from './entities/suscripcion.entity';
import { Ciclo, cicloVigente, estaCerrado } from './ciclo-facturacion.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

export interface UsoCuotaEcf {
  /** e-CF emitidos en el ciclo, sin contar los de prueba. */
  emitidos:   number;
  /** e-CF incluidos en el plan. -1 = sin tope. */
  cupo:       number;
  ilimitado:  boolean;
  porcentaje: number;
  /** Cuántos van por encima del cupo. 0 si no se ha pasado. */
  excedente:  number;
  /** ≥80%: conviene avisar. */
  alerta:     boolean;
  /** ≥100%: cada e-CF a partir de aquí se factura aparte. */
  excedida:   boolean;
  ciclo:      Ciclo;
  cicloCerrado: boolean;
  plan:       PlanTipo | null;
  planNombre: string;
}

/**
 * Cuánto de su cuota de e-CF lleva gastado una empresa en su ciclo.
 *
 * NUNCA bloquea una emisión. El único efecto de pasarse es que el super admin
 * ve el ciclo en el panel de excedentes y decide si genera el cargo. Por eso
 * todo lo que se llama desde el camino de emisión va envuelto y no propaga.
 *
 * No hay contador incremental: se cuenta con `COUNT(*)` sobre `ecf` acotado al
 * ciclo. La fila de `ecf` se inserta dentro de la misma transacción que
 * incrementa la secuencia, así que una fila es exactamente una secuencia
 * consumida y `createdAt` no se mueve nunca — un ciclo cerrado siempre devuelve
 * el mismo número. Un caché no da esa garantía: el de ingresos
 * (`suscripciones."ingresosMesActualDop"`) va desviado en producción. Con
 * `idx_ecf_empresa_fecha`, contar el peor ciclo del sistema (5.112 filas) son
 * 2,1 ms por Index Only Scan.
 */
@Injectable()
export class CuotaEcfService {
  private readonly logger = new Logger(CuotaEcfService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /**
   * Plan y día de corte de una empresa.
   *
   * Consulta cruda y no `LimitesService.getSuscripcion()` a propósito: aquella
   * CREA la suscripción si no existe y dispara el reset mensual. Contar cuota
   * es una lectura y no debe tener ese efecto, y menos desde el camino de
   * emisión de un comprobante fiscal.
   */
  private async datosSuscripcion(
    empresaId: number,
  ): Promise<{ plan: PlanTipo | null; diaCorte: number; estado: string | null }> {
    const [row] = await this.ds.query<{ plan: string; diaCorte: number; estado: string }[]>(
      `SELECT plan, COALESCE("diaCorte", 1) AS "diaCorte", estado
         FROM suscripciones WHERE "empresaId" = $1 LIMIT 1`,
      [empresaId],
    );
    return {
      plan:     (row?.plan as PlanTipo) ?? null,
      diaCorte: Number(row?.diaCorte ?? 1),
      estado:   row?.estado ?? null,
    };
  }

  /**
   * e-CF emitidos por una empresa dentro de un ciclo.
   *
   * Cuenta TODA fila de `ecf` del período: una secuencia consumida es consumida
   * aunque la DGII rechace el comprobante. Lo único que se descarta son los
   * emitidos en TEST o CERTIFICACIÓN, que no llegan a la DGII.
   *
   * `modoEmision` es NOT NULL con DEFAULT 'PRODUCCION', así que la igualdad
   * basta: una marca ausente ya no puede eximir de la cuota, y el predicado
   * simple deja que `idx_ecf_empresa_modo_fecha` resuelva por Index Only Scan.
   */
  async contarEmitidos(empresaId: number, ciclo: Ciclo): Promise<number> {
    const [r] = await this.ds.query<{ n: string }[]>(
      `SELECT COUNT(*)::int AS n
         FROM ecf
        WHERE "empresaId" = $1
          AND "modoEmision" = 'PRODUCCION'
          AND "createdAt" >= $2::date
          AND "createdAt" <  $3::date`,
      [empresaId, ciclo.inicio, ciclo.fin],
    );
    return Number(r?.n ?? 0);
  }

  /** El uso de un ciclo concreto; por defecto, el que está en curso. */
  async usoDelCiclo(empresaId: number, ciclo?: Ciclo): Promise<UsoCuotaEcf> {
    const { plan, diaCorte } = await this.datosSuscripcion(empresaId);
    const elCiclo = ciclo ?? cicloVigente(diaCorte);

    const cfg  = plan ? PLANES[plan] : undefined;
    const cupo = cfg?.limiteEcfMensual ?? -1;

    const emitidos  = await this.contarEmitidos(empresaId, elCiclo);
    const ilimitado = cupo === -1;

    return {
      emitidos,
      cupo,
      ilimitado,
      porcentaje:   ilimitado ? 0 : Math.round((emitidos / Math.max(1, cupo)) * 100),
      excedente:    ilimitado ? 0 : Math.max(0, emitidos - cupo),
      alerta:       !ilimitado && emitidos >= cupo * 0.8,
      excedida:     !ilimitado && emitidos > cupo,
      ciclo:        elCiclo,
      cicloCerrado: estaCerrado(elCiclo),
      plan:         plan,
      planNombre:   cfg?.nombre ?? '—',
    };
  }

  /** El precio vigente del excedente. 0 = sin configurar, no gratis. */
  async precioExcedente(): Promise<number> {
    const [r] = await this.ds.query<{ p: string }[]>(
      `SELECT "precioEcfExcedente" AS p FROM configuracion_cobros WHERE id = 1`,
    );
    return Number(r?.p ?? 0);
  }

  /**
   * Reclama el derecho a mandar UN aviso, de forma atómica.
   *
   * Devuelve true solo al primero que llegue. La comprobación y la marca van en
   * el mismo UPDATE a propósito: leer primero y escribir después deja una
   * ventana en la que dos emisiones simultáneas ven la marca vacía y mandan las
   * dos. No es teórico — la empresa que más factura emite ~300 comprobantes al
   * día desde varias cajas a la vez.
   *
   * Se marca ANTES de enviar. Si el correo falla, se pierde un aviso; al revés,
   * un fallo tras enviar reabriría la puerta a una tanda de correos repetidos.
   * Perder un aviso es recuperable —viene el del 100%, y el panel lo enseña—;
   * inundar al cliente no.
   */
  private async reclamarAviso(
    empresaId: number,
    ciclo: Ciclo,
    umbral: 80 | 100,
  ): Promise<boolean> {
    await this.ds.query(
      `INSERT INTO ecf_consumo_ciclo ("empresaId","cicloInicio","cicloFin")
       VALUES ($1,$2,$3)
       ON CONFLICT ("empresaId","cicloInicio") DO NOTHING`,
      [empresaId, ciclo.inicio, ciclo.fin],
    );

    // Al reclamar el de 100 se da por servido también el de 80: mandar "vas por
    // el 80%" DESPUÉS de "lo superaste" no tiene ningún sentido, y pasa cuando
    // un ciclo cruza los dos umbrales de golpe o cambia el plan a la baja.
    const sql = umbral === 100
      ? `UPDATE ecf_consumo_ciclo
            SET "aviso100EnviadoEn" = now(),
                "aviso80EnviadoEn"  = COALESCE("aviso80EnviadoEn", now()),
                "updatedAt"         = now()
          WHERE "empresaId" = $1 AND "cicloInicio" = $2 AND "aviso100EnviadoEn" IS NULL
          RETURNING id`
      : `UPDATE ecf_consumo_ciclo
            SET "aviso80EnviadoEn" = now(), "updatedAt" = now()
          WHERE "empresaId" = $1 AND "cicloInicio" = $2 AND "aviso80EnviadoEn" IS NULL
          RETURNING id`;

    const filas = await this.ds.query<{ id: number }[]>(sql, [empresaId, ciclo.inicio]);
    return filas.length > 0;
  }

  /**
   * Se llama después de emitir un e-CF, fuera de la transacción fiscal y sin
   * esperar el resultado.
   *
   * Por debajo del 80% no escribe NADA: el caso normal son dos SELECT y a otra
   * cosa. La fila del ciclo solo nace cuando hay algo que recordar.
   */
  async revisarTrasEmision(empresaId: number): Promise<void> {
    const uso = await this.usoDelCiclo(empresaId);
    if (uso.ilimitado || (!uso.alerta && !uso.excedida)) return;

    const umbral: 80 | 100 = uso.excedida ? 100 : 80;
    if (!(await this.reclamarAviso(empresaId, uso.ciclo, umbral))) return;

    if (umbral === 100) {
      this.logger.warn(
        `[cuota-ecf] empresa #${empresaId} EXCEDIÓ su plan ${uso.planNombre}: ` +
        `${uso.emitidos}/${uso.cupo}, ${uso.excedente} excedente(s) ` +
        `en el ciclo ${uso.ciclo.inicio}→${uso.ciclo.fin}`,
      );
    } else {
      this.logger.log(
        `[cuota-ecf] empresa #${empresaId} al ${uso.porcentaje}% de su plan ` +
        `${uso.planNombre}: ${uso.emitidos}/${uso.cupo} en el ciclo ${uso.ciclo.inicio}`,
      );
    }

    // El aviso ya está reclamado: si el correo falla, se registra y se sigue.
    // Nunca puede propagar hacia el camino de emisión.
    try {
      await this.notificaciones.notificarCuotaEcf(empresaId, umbral, {
        plan:            uso.planNombre,
        emitidos:        uso.emitidos,
        cupo:            uso.cupo,
        excedente:       uso.excedente,
        porcentaje:      uso.porcentaje,
        cicloInicio:     uso.ciclo.inicio,
        cicloFin:        uso.ciclo.fin,
        precioExcedente: await this.precioExcedente(),
      });
    } catch (err) {
      this.logger.error(
        `[cuota-ecf] aviso ${umbral}% de empresa #${empresaId} quedó marcado pero NO se envió: ` +
        `${(err as Error).message}`,
      );
    }
  }
}
