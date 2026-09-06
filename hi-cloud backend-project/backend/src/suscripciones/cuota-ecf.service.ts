import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PLANES, PlanTipo } from './entities/suscripcion.entity';
import { Ciclo, cicloVigente, ciclosRecientes, estaCerrado } from './ciclo-facturacion.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

/** Una fila del panel de excedentes. */
export interface ExcedentePendiente {
  empresaId:  number;
  empresa:    string;
  plan:       PlanTipo;
  planNombre: string;
  ciclo:      Ciclo;
  emitidos:   number;
  cupo:       number;
  excedente:  number;
  precioUnitario: number;
  monto:      number;
}

/** Las cifras autoritativas con las que se genera un cargo. */
export interface DatosCargo {
  ciclo:      Ciclo;
  plan:       PlanTipo;
  planNombre: string;
  emitidos:   number;
  cupo:       number;
  excedente:  number;
  precioUnitario: number;
  monto:      number;
}

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

  // ── Panel de excedentes ────────────────────────────────────────────────────

  /**
   * Ciclos CERRADOS con excedente que todavía no se han cobrado.
   *
   * Tres filtros, los tres deliberados:
   *
   *  · **Cerrados.** Un ciclo en curso todavía puede sumar comprobantes; un
   *    cargo emitido a mitad de período quedaría corto en cuanto el cliente
   *    facture otra vez.
   *  · **Suscripción activa.** Una empresa en prueba o suspendida que revienta
   *    su cupo es una conversación de ventas, no un cargo.
   *  · **Sin cargo.** La fila con `cargoId` puesto es el recibo: si existe, ese
   *    ciclo ya se cobró y no vuelve a aparecer.
   *
   * Se miran los últimos 6 ciclos de cada empresa. Cubre a quien lleve medio
   * año sin cobrar y evita recorrer el histórico entero cada vez que se abre el
   * panel.
   */
  async excedentesPendientes(): Promise<ExcedentePendiente[]> {
    const empresas = await this.ds.query<{
      empresaId: number; nombre: string; plan: PlanTipo; diaCorte: number;
    }[]>(
      `SELECT e.id AS "empresaId", e.nombre, s.plan, COALESCE(s."diaCorte", 1) AS "diaCorte"
         FROM empresa e
         JOIN suscripciones s ON s."empresaId" = e.id
        WHERE e."isActive" = true AND s.estado = 'activa'
        ORDER BY e.id`,
    );

    const precio = await this.precioExcedente();
    const salida: ExcedentePendiente[] = [];

    for (const emp of empresas) {
      const cfg  = PLANES[emp.plan];
      const cupo = cfg?.limiteEcfMensual ?? -1;
      if (cupo === -1) continue;

      for (const ciclo of ciclosRecientes(Number(emp.diaCorte), 6)) {
        if (!estaCerrado(ciclo)) continue;

        const emitidos  = await this.contarEmitidos(emp.empresaId, ciclo);
        const excedente = emitidos - cupo;
        if (excedente <= 0) continue;

        const [fila] = await this.ds.query<{ cargoId: number | null }[]>(
          `SELECT "cargoId" FROM ecf_consumo_ciclo
            WHERE "empresaId" = $1 AND "cicloInicio" = $2::date`,
          [emp.empresaId, ciclo.inicio],
        );
        if (fila?.cargoId) continue;   // ya cobrado

        salida.push({
          empresaId:  emp.empresaId,
          empresa:    emp.nombre,
          plan:       emp.plan,
          planNombre: cfg.nombre,
          ciclo,
          emitidos,
          cupo,
          excedente,
          precioUnitario: precio,
          monto: +(excedente * precio).toFixed(2),
        });
      }
    }

    // Lo más caro primero: es lo que el super admin quiere mirar antes.
    return salida.sort((a, b) => b.monto - a.monto || b.excedente - a.excedente);
  }

  /**
   * Recuenta un ciclo concreto y devuelve las cifras con las que se cobraría.
   *
   * La usa el endpoint del cargo: el monto NUNCA llega en el body. El que
   * teclea es el super admin y el que paga es otro, así que el servidor
   * recuenta los comprobantes y relee el precio en el mismo momento de cobrar.
   * Mismo criterio que el preview de pago: el cliente no calcula dinero.
   *
   * Lanza si el ciclo no se puede cobrar, con el motivo exacto.
   */
  async datosParaCargo(empresaId: number, cicloInicio: string): Promise<DatosCargo> {
    const [sus] = await this.ds.query<{ plan: PlanTipo; diaCorte: number; estado: string }[]>(
      `SELECT plan, COALESCE("diaCorte", 1) AS "diaCorte", estado
         FROM suscripciones WHERE "empresaId" = $1`,
      [empresaId],
    );
    if (!sus) throw new NotFoundException(`La empresa #${empresaId} no tiene suscripción.`);
    if (sus.estado !== 'activa') {
      throw new BadRequestException(
        `La suscripción de la empresa #${empresaId} está en "${sus.estado}". ` +
        `Solo se cobran excedentes de suscripciones activas.`,
      );
    }

    const cfg  = PLANES[sus.plan];
    const cupo = cfg?.limiteEcfMensual ?? -1;
    if (cupo === -1) {
      throw new BadRequestException(`El plan ${sus.plan} no tiene cupo de e-CF.`);
    }

    // El ciclo se REDERIVA del diaCorte, no se acepta tal cual del cliente: así
    // un `cicloInicio` inventado no puede colar un período que no existe.
    const ciclo = ciclosRecientes(Number(sus.diaCorte), 12)
      .find(c => c.inicio === cicloInicio);
    if (!ciclo) {
      throw new BadRequestException(
        `El ciclo que empieza el ${cicloInicio} no corresponde al día de corte ` +
        `${sus.diaCorte} de esta empresa.`,
      );
    }
    if (!estaCerrado(ciclo)) {
      throw new BadRequestException(
        `El ciclo ${ciclo.inicio} sigue abierto (cierra el ${ciclo.fin}). ` +
        `Todavía puede sumar comprobantes: no se cobra hasta que cierre.`,
      );
    }

    const [yaCobrado] = await this.ds.query<{ cargoId: number | null }[]>(
      `SELECT "cargoId" FROM ecf_consumo_ciclo
        WHERE "empresaId" = $1 AND "cicloInicio" = $2::date`,
      [empresaId, ciclo.inicio],
    );
    if (yaCobrado?.cargoId) {
      throw new BadRequestException(
        `Ese ciclo ya se cobró con el cargo #${yaCobrado.cargoId}.`,
      );
    }

    const emitidos  = await this.contarEmitidos(empresaId, ciclo);
    const excedente = emitidos - cupo;
    if (excedente <= 0) {
      throw new BadRequestException(
        `La empresa emitió ${emitidos} de ${cupo} comprobantes en ese ciclo: ` +
        `no se pasó, no hay nada que cobrar.`,
      );
    }

    const precioUnitario = await this.precioExcedente();
    if (precioUnitario <= 0) {
      throw new BadRequestException(
        'El precio del excedente de e-CF está sin configurar. ' +
        'Ponlo en Super Admin → Planes y Precios antes de generar cargos.',
      );
    }

    return {
      ciclo, plan: sus.plan, planNombre: cfg.nombre,
      emitidos, cupo, excedente, precioUnitario,
      monto: +(excedente * precioUnitario).toFixed(2),
    };
  }

  /**
   * Sella la fila del ciclo como cobrada. Va DENTRO de la transacción del cargo.
   *
   * El `UPDATE` exige `cargoId IS NULL`: si dos pulsaciones llegan a la vez,
   * solo una sella y la otra se encuentra 0 filas y revienta la transacción
   * entera —cargo incluido—. Es la misma guarda que la de los avisos, y se lee
   * igual: envuelta en un CTE, porque `query()` sobre un UPDATE devuelve
   * `[filas, rowCount]` y contar su longitud da siempre 2.
   */
  async sellarCargo(
    manager: EntityManager,
    empresaId: number,
    d: DatosCargo,
    cargoId: number,
    adminId: number | null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO ecf_consumo_ciclo ("empresaId","cicloInicio","cicloFin")
       VALUES ($1,$2::date,$3::date)
       ON CONFLICT ("empresaId","cicloInicio") DO NOTHING`,
      [empresaId, d.ciclo.inicio, d.ciclo.fin],
    );

    const [sello] = await manager.query<{ n: number }[]>(
      `WITH sellado AS (
         UPDATE ecf_consumo_ciclo
            SET "planCobrado"      = $3,
                "cupoCobrado"      = $4,
                "emitidosCobrados" = $5,
                "precioUnitario"   = $6,
                "monto"            = $7,
                "cargoId"          = $8,
                "cobradoEn"        = now(),
                "cobradoPor"       = $9,
                "updatedAt"        = now()
          WHERE "empresaId" = $1 AND "cicloInicio" = $2::date AND "cargoId" IS NULL
        RETURNING id
       )
       SELECT COUNT(*)::int AS n FROM sellado`,
      [empresaId, d.ciclo.inicio, d.plan, d.cupo, d.emitidos,
       d.precioUnitario, d.monto, cargoId, adminId],
    );

    if (Number(sello?.n ?? 0) === 0) {
      throw new ConflictException(
        'Ese ciclo se cobró mientras se generaba este cargo. No se duplica.',
      );
    }
  }

  /** El precio vigente del excedente. 0 = sin configurar, no gratis. */
  async precioExcedente(): Promise<number> {
    const [r] = await this.ds.query<{ p: string }[]>(
      `SELECT "precioEcfExcedente" AS p FROM configuracion_cobros WHERE id = 1`,
    );
    return Number(r?.p ?? 0);
  }

  /**
   * La configuración de cobros con su rastro: quién la tocó y cuándo.
   *
   * La fila se siembra en la migración, pero se recrea aquí si faltara: que el
   * panel de cobros reviente por una fila ausente sería absurdo.
   */
  async getConfiguracionCobros(): Promise<{
    precioEcfExcedente: number;
    actualizadoPor: number | null;
    updatedAt: Date | null;
    /**
     * Fecha de corte del cargo automático de renovación de suscripción
     * (ver `SuscripcionesService.generarCargosRenovacion`). Solo lectura
     * aquí — se siembra en una migración, a propósito: no hay PATCH para
     * moverla desde este servicio.
     */
    cargoAutomaticoSuscripcionDesde: string | null;
  }> {
    await this.ds.query(
      `INSERT INTO configuracion_cobros (id, "precioEcfExcedente")
       VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
    );
    const [r] = await this.ds.query<
      {
        precioEcfExcedente: string; actualizadoPor: number | null; updatedAt: Date;
        cargoAutomaticoSuscripcionDesde: string | null;
      }[]
    >(`SELECT "precioEcfExcedente", "actualizadoPor", "updatedAt",
              "cargoAutomaticoSuscripcionDesde"::text AS "cargoAutomaticoSuscripcionDesde"
         FROM configuracion_cobros WHERE id = 1`);
    return {
      precioEcfExcedente:               Number(r?.precioEcfExcedente ?? 0),
      actualizadoPor:                   r?.actualizadoPor ?? null,
      updatedAt:                        r?.updatedAt ?? null,
      cargoAutomaticoSuscripcionDesde:  r?.cargoAutomaticoSuscripcionDesde ?? null,
    };
  }

  /**
   * Cambia el precio del excedente.
   *
   * NO reprecia nada de lo ya cobrado: el precio de un cargo se congela en su
   * fila de `ecf_consumo_ciclo` cuando se genera. Este valor solo afecta a lo
   * que se calcule a partir de ahora. Mismo criterio que
   * `TARIFA_ACTIVACION_VERSION` en las solicitudes de activación.
   */
  async actualizarPrecioExcedente(
    precio: number,
    adminId: number | null,
  ): Promise<{ precioEcfExcedente: number; actualizadoPor: number | null; updatedAt: Date | null }> {
    await this.getConfiguracionCobros();   // garantiza la fila
    await this.ds.query(
      `UPDATE configuracion_cobros
          SET "precioEcfExcedente" = $1, "actualizadoPor" = $2, "updatedAt" = now()
        WHERE id = 1`,
      [precio, adminId],
    );
    this.logger.warn(
      `[cuota-ecf] precio del excedente cambiado a RD$${precio} por el admin #${adminId ?? '?'}`,
    );
    return this.getConfiguracionCobros();
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
    //
    // El UPDATE va envuelto en un CTE para que la sentencia de arriba sea un
    // SELECT. NO es cosmético: `DataSource.query()` solo garantiza devolver un
    // array de filas para un SELECT; con un `UPDATE ... RETURNING` devuelve la
    // estructura cruda del driver, y `filas.length > 0` daba SIEMPRE true.
    //
    // Eso ya se escapó a producción: la empresa 44 recibió un correo por cada
    // comprobante emitido —16 en cuatro emisiones, camino de ~760 al día— con
    // la marca del ciclo correctamente puesta desde el primero. Contar filas de
    // un SELECT es un contrato que no depende del driver.
    const sql = umbral === 100
      ? `WITH reclamado AS (
           UPDATE ecf_consumo_ciclo
              SET "aviso100EnviadoEn" = now(),
                  "aviso80EnviadoEn"  = COALESCE("aviso80EnviadoEn", now()),
                  "updatedAt"         = now()
            WHERE "empresaId" = $1 AND "cicloInicio" = $2 AND "aviso100EnviadoEn" IS NULL
            RETURNING id
         )
         SELECT COUNT(*)::int AS n FROM reclamado`
      : `WITH reclamado AS (
           UPDATE ecf_consumo_ciclo
              SET "aviso80EnviadoEn" = now(), "updatedAt" = now()
            WHERE "empresaId" = $1 AND "cicloInicio" = $2 AND "aviso80EnviadoEn" IS NULL
            RETURNING id
         )
         SELECT COUNT(*)::int AS n FROM reclamado`;

    const [r] = await this.ds.query<{ n: number }[]>(sql, [empresaId, ciclo.inicio]);
    return Number(r?.n ?? 0) > 0;
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
