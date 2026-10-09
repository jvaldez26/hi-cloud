import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { clasificarMorosidad, r2 } from '../utils/mora.util';
import { calcularTablaAmortizacion } from '../motor/amortizacion-v2.util';
import { resolverMotorConfig, aplicarOverridesSolicitud, construirParametrosPrestamo, aniosDelPlazo, MotorConfigAlmacenado } from '../motor/motor-adaptador.util';
import { AsientosAutomaticosService } from '../../contabilidad/services/asientos-automaticos.service';
import { TenantService } from '../../tenant/tenant.service';
import { FeriadosService } from '../feriados/feriados.service';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class PrestamosService {
  private readonly logger = new Logger(PrestamosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly asientos: AsientosAutomaticosService,
    private readonly tenantSvc: TenantService,
    private readonly feriadosSvc: FeriadosService,
  ) {}

  /**
   * C5: el JOIN a pr_deudores solo filtraba por p.empresaId, nunca por
   * d.empresaId. Si alguna vez un préstamo quedó enlazado a un deudorId de
   * OTRA empresa (ver assertDeudorDeEmpresa en crearEnTransaccion), este
   * filtro es la segunda barrera que evita exponer esos datos ajenos.
   */
  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT p.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula", d.telefono as "deudorTelefono",
              pp.nombre as "productoNombre"
       FROM pr_prestamos p
       JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
       LEFT JOIN pr_productos_prestamo pp ON pp.id=p."productoId"
       WHERE p.id=$1 AND p."empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Préstamo #${id} no encontrado`);
    return row;
  }

  async findAll(empresaId: number, params: any) {
    const page  = Math.max(1, Number(params.page)  || 1);
    const limit = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;
    const conds: string[] = [`p."empresaId"=$1`];
    const args: any[] = [empresaId];
    let idx = 2;
    if (params.estado) { conds.push(`p.estado=$${idx++}`); args.push(params.estado); }
    if (params.deudorId) { conds.push(`p."deudorId"=$${idx++}`); args.push(params.deudorId); }
    if (params.search) {
      conds.push(`(d.nombre ILIKE $${idx} OR d.cedula ILIKE $${idx} OR p.numero ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId" WHERE ${where}`, args,
    );
    const data = await this.ds.query(
      `SELECT p.*, d.nombre as "deudorNombre", d.cedula as "deudorCedula", d.foto as "deudorFoto"
       FROM pr_prestamos p JOIN pr_deudores d ON d.id=p."deudorId" AND d."empresaId"=p."empresaId"
       WHERE ${where} ORDER BY p."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(empresaId: number, id: number) {
    const prestamo = await this.orFail(empresaId, id);
    const cuotas = await this.ds.query(
      `SELECT * FROM pr_cuotas WHERE "prestamoId"=$1 ORDER BY "numeroCuota"`, [id],
    );
    const pagos = await this.ds.query(
      `SELECT * FROM pr_pagos WHERE "prestamoId"=$1 ORDER BY fecha DESC`, [id],
    );
    return { ...prestamo, cuotas, pagos };
  }

  /**
   * Motor v2 (Fase 2B) — el simulador ya no tiene su propia copia de la
   * aritmética financiera: construye los mismos ParametrosPrestamo que el
   * desembolso real y llama al mismo `calcularTablaAmortizacion()`. Una
   * sola fuente de verdad — ver docs/prestamista/motor-financiero.md.
   */
  async simular(empresaId: number, data: any) {
    const config: MotorConfigAlmacenado = {
      frecuencia: data.frecuencia,
      frecuenciaDiaria: data.frecuenciaDiaria,
      frecuenciaQuincenal: data.frecuenciaQuincenal,
      tasa: data.tasa,
      metodo: data.metodo,
      metodoPosteriorGracia: data.metodoPosteriorGracia,
      periodosSoloInteres: data.periodosSoloInteres,
      gracia: data.gracia,
      cargos: data.cargos,
    };
    const feriados = data.frecuencia === 'diaria' && data.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(data.fechaDesembolso, data.plazoPeriodos))
      : undefined;
    const params = construirParametrosPrestamo(config, {
      montoPrincipal: Number(data.montoPrincipal),
      fechaDesembolso: data.fechaDesembolso,
      fechaPrimerPago: data.fechaPrimerPago,
      plazoPeriodos: Number(data.plazoPeriodos),
    }, feriados);
    return calcularTablaAmortizacion(params);
  }

  /**
   * C2 — Desembolso.
   *
   * Antes esto eran ~8 queries sueltas: si fallaba la inserción de la cuota 7 de
   * 12, quedaba un préstamo a medias con su deudor ya actualizado. Ahora todo
   * ocurre dentro de una transacción.
   *
   * Y la solicitud se bloquea con FOR UPDATE y se exige que siga 'aprobada':
   * antes solo se miraba cuando el body venía incompleto, así que dos peticiones
   * con los parámetros completos desembolsaban DOS veces la misma solicitud.
   */
  async create(empresaId: number, data: any) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const prestamoId = await this.crearEnTransaccion(qr, empresaId, data);
      await qr.commitTransaction();

      // Fuera de la transacción: si el asiento falla, el desembolso ya es válido.
      this.asientos.asientoDesembolsoPrestamo(
        prestamoId.id, prestamoId.numero, prestamoId.montoDesembolsado,
        data.formaPago ?? 'transferencia', data.fechaDesembolso ?? fechaHoyRD(),
        this.tenantSvc.getUserId() ?? 0,
        prestamoId.cargoAperturaRetenido,
      ).catch(err => this.logger.error(`Asiento desembolso ${prestamoId.numero}: ${err.message}`));

      return this.findOne(empresaId, prestamoId.id);
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async crearEnTransaccion(qr: QueryRunner, empresaId: number, data: any) {
    // C2: la solicitud se bloquea y se valida SIEMPRE que se indique, vengan o no
    // los parámetros en el body.
    if (data.solicitudId) {
      const [sol] = await qr.query(
        `SELECT * FROM pr_solicitudes WHERE id=$1 AND "empresaId"=$2 FOR UPDATE`,
        [data.solicitudId, empresaId],
      );
      if (!sol) throw new BadRequestException('Solicitud no encontrada');
      if (sol.estado !== 'aprobada') {
        throw new BadRequestException(
          `La solicitud #${data.solicitudId} está en estado "${sol.estado}" y no puede desembolsarse` +
          `${sol.estado === 'desembolsada' ? ' de nuevo' : ''}.`,
        );
      }
      data.deudorId           = data.deudorId           ?? sol.deudorId;
      data.productoId         = data.productoId         ?? sol.productoId;
      data.montoPrincipal     = data.montoPrincipal     ?? sol.montoAprobado ?? sol.montoSolicitado;
      data.tasaInteresMensual = data.tasaInteresMensual ?? sol.tasaAprobada;
      data.plazoMeses         = data.plazoMeses         ?? sol.plazoMeses;
      data.frecuenciaPago     = data.frecuenciaPago     ?? sol.frecuenciaPago;
      data.oficialId          = data.oficialId          ?? sol.oficialId;
      data.oficialNombre      = data.oficialNombre      ?? sol.oficialNombre;
    }

    // Motor v2 (Fase 2B): todo préstamo nuevo se crea con el motor v2 — ver
    // docs/prestamista/motor-financiero.md. fechaPrimerPago sin especificar
    // solo tiene default para frecuencia mensual (el caso de siempre); para
    // el resto de frecuencias hay que indicarla explícitamente.
    if (!data.fechaPrimerPago && data.fechaDesembolso && (!data.frecuenciaPago || data.frecuenciaPago === 'mensual')) {
      const fd = new Date(data.fechaDesembolso);
      fd.setMonth(fd.getMonth() + 1);
      data.fechaPrimerPago = fd.toISOString().split('T')[0];
    }

    const { deudorId, montoPrincipal, plazoMeses, fechaPrimerPago: fpRaw, fechaDesembolso } = data;
    if (!deudorId || !montoPrincipal || !plazoMeses || !fpRaw || !fechaDesembolso) {
      throw new BadRequestException('Faltan campos requeridos: deudorId, montoPrincipal, plazoMeses, fechaDesembolso, fechaPrimerPago');
    }
    if (!data.productoId && !data.tasaInteresMensual) {
      throw new BadRequestException('Sin productoId, tasaInteresMensual es obligatorio');
    }

    // C5: valida SIEMPRE, venga el deudorId de una solicitud o directo en el
    // body — un body con solicitudId Y un deudorId explícito distinto pisaba
    // el de la solicitud (ya validado al crearla) sin pasar por ningún
    // chequeo de empresa. Dentro de la misma transacción, igual que el
    // bloqueo FOR UPDATE de la solicitud.
    const [deudor] = await qr.query(
      `SELECT 1 FROM pr_deudores WHERE id=$1 AND "empresaId"=$2 LIMIT 1`, [deudorId, empresaId],
    );
    if (!deudor) throw new BadRequestException(`Deudor #${deudorId} no encontrado`);

    const [seq] = await qr.query(
      `SELECT siguiente_numero_secuencia($1, $2) AS num`, [empresaId, 'PRE'],
    );
    const numero = `PRE-${seq.num}`;

    if (isNaN(new Date(fpRaw).getTime())) {
      throw new BadRequestException('fechaPrimerPago no es una fecha válida');
    }

    // Config del motor: la del producto (o un equivalente sintetizado si no
    // tiene motorConfig — Etapa 1 — o si no viene de un producto) + los
    // ajustes de la solicitud/body (tasa y frecuencia), si se permiten.
    let config: MotorConfigAlmacenado;
    if (data.productoId) {
      const [producto] = await qr.query(
        `SELECT * FROM pr_productos_prestamo WHERE id=$1 AND "empresaId"=$2`, [data.productoId, empresaId],
      );
      if (!producto) throw new BadRequestException(`Producto #${data.productoId} no encontrado`);
      config = resolverMotorConfig(producto);
    } else {
      config = {
        frecuencia: (data.frecuenciaPago ?? 'mensual') as any,
        tasa: { valor: Number(data.tasaInteresMensual) / 100, periodoExpresado: 'mensual', tipo: 'nominal', baseDias: 360 },
        metodo: (data.metodoAmortizacion === 'aleman' ? 'aleman' : 'frances') as any,
        mora: { base: 'cuota_vencida', tasaOMonto: Number(data.porcentajeMora ?? 0), baseDiasMora: 360 },
      };
    }
    config = aplicarOverridesSolicitud(config, {
      tasaInteresMensual: data.tasaInteresMensual,
      frecuencia: data.frecuenciaPago,
      metodo: data.metodoAmortizacion,
    });

    const feriados = config.frecuencia === 'diaria' && config.frecuenciaDiaria?.excluirFeriados
      ? await this.feriadosSvc.obtenerSetFeriados(empresaId, aniosDelPlazo(fechaDesembolso, Number(plazoMeses)))
      : undefined;

    const resultado = calcularTablaAmortizacion(construirParametrosPrestamo(config, {
      montoPrincipal: Number(montoPrincipal),
      fechaDesembolso,
      fechaPrimerPago: fpRaw,
      plazoPeriodos: Number(plazoMeses),
    }, feriados));

    if (!resultado.tabla.length) {
      throw new BadRequestException('No se pudo generar el plan de amortización (plazo inválido)');
    }

    const ultimaCuota = resultado.tabla[resultado.tabla.length - 1];

    // C5: autor del desembolso desde el CLS (JWT), nunca del body.
    const uid = this.tenantSvc.getUserId();

    // Campos planos (compat con pantallas que todavía leen tasaInteresMensual/
    // frecuenciaPago/metodoAmortizacion directo) — espejo de la config real,
    // que vive completa en "motorConfig". Ver nota en motor-adaptador.util.ts:
    // para frecuencias no mensuales, "tasaInteresMensual" no es literal
    // (queda como referencia aproximada, no como fuente de verdad).
    const [prestamo] = await qr.query(
      `INSERT INTO pr_prestamos ("empresaId",numero,"solicitudId","deudorId","productoId","montoPrincipal",
        "tasaInteresMensual","plazoMeses","frecuenciaPago","metodoAmortizacion","cuotaPeriodica",
        "porcentajeMora","diasGracia","cargoCierre","fechaDesembolso","fechaPrimerPago","fechaVencimiento",
        "totalInteres","totalAPagar","saldoCapital","saldoInteres","saldoTotal","oficialId","oficialNombre",notas,"creadoPor",
        "motorVersion","motorConfig")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [empresaId, numero, data.solicitudId ?? null, data.deudorId, data.productoId ?? null,
       resultado.montoPrincipalFinanciado, config.tasa.valor * 100, data.plazoMeses, config.frecuencia,
       config.metodo, resultado.cuotaFija,
       config.mora?.tasaOMonto ?? 0, config.gracia?.periodos ?? 0, 0,
       data.fechaDesembolso, data.fechaPrimerPago, ultimaCuota.fecha,
       resultado.totalInteres, resultado.totalAPagar,
       resultado.montoPrincipalFinanciado, resultado.totalInteres, resultado.totalAPagar,
       data.oficialId ?? null, data.oficialNombre ?? null, data.notas ?? null, uid,
       'v2', JSON.stringify(config)],
    );

    // Insertar cuotas
    for (const linea of resultado.tabla) {
      await qr.query(
        `INSERT INTO pr_cuotas ("empresaId","prestamoId","numeroCuota","fechaVencimiento",capital,interes,"cuotaTotal","saldoRestante",cargos,"esPeriodoGracia")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [empresaId, prestamo.id, linea.numeroCuota, linea.fecha,
         linea.capital, linea.interes, linea.cuotaTotal, linea.saldoRestante,
         linea.cargos?.length ? JSON.stringify(linea.cargos) : null, linea.esPeriodoGracia],
      );
    }

    // Actualizar estadísticas del deudor
    await qr.query(
      `UPDATE pr_deudores SET "totalPrestado"="totalPrestado"+$1,"prestamosActivos"="prestamosActivos"+1,"updatedAt"=NOW()
       WHERE id=$2 AND "empresaId"=$3`,
      [resultado.montoPrincipalFinanciado, data.deudorId, empresaId],
    );

    // Marcar solicitud como desembolsada si viene de una
    if (data.solicitudId) {
      await qr.query(
        `UPDATE pr_solicitudes SET estado='desembolsada' WHERE id=$1 AND "empresaId"=$2`,
        [data.solicitudId, empresaId],
      );
    }

    // §5.1 del motor — lo que sale de cartera (montoPrincipalFinanciado, que
    // ya incluye cualquier cargo financiado) no es lo que el deudor recibe
    // en mano (montoRecibidoDeudor, que ya restó lo descontado) — la
    // diferencia es el total de cargos retenidos por el prestamista al
    // desembolsar (financiados + descontados). El asiento contable (fuera
    // de esta transacción, en create()) lo necesita para registrarlo.
    const cargoAperturaRetenido = r2(resultado.montoPrincipalFinanciado - resultado.montoRecibidoDeudor);

    return {
      id: prestamo.id,
      numero,
      montoDesembolsado: resultado.montoPrincipalFinanciado,
      cargoAperturaRetenido,
    };
  }

  async recalcularSaldos(empresaId: number, id: number) {
    const p = await this.orFail(empresaId, id);
    const [s] = await this.ds.query<any[]>(
      `SELECT
         SUM(GREATEST(0, capital - "capitalPagado"))                                        AS "saldoCapital",
         SUM(GREATEST(0, interes - "interesPagado"))                                        AS "saldoInteres",
         -- Misma fórmula que mora.util.ts saldoMoraPendiente()/sumarSaldoMoraPendiente()
         -- (único lugar donde está probada), reescrita en SQL para agregarla en el
         -- mismo viaje a BD que el resto de los saldos — traer todas las cuotas a JS
         -- solo para esta suma sería un viaje extra sin necesidad. Si cambia la
         -- definición allá, cambiar también aquí y en pagos.service.ts/mora.cron.ts.
         SUM(GREATEST(0, "moraGenerada" - "moraPagada"))                                    AS "saldoMora",
         COUNT(*) FILTER (WHERE estado <> 'pagada')                                         AS "cuotasPendientes",
         COUNT(*) FILTER (WHERE estado <> 'pagada' AND "fechaVencimiento" < CURRENT_DATE)   AS "cuotasVencidas",
         MAX("diasMora") FILTER (WHERE estado <> 'pagada')                                  AS "maxDiasMora",
         COALESCE(SUM("totalPagado"), 0)                                                    AS "totalPagadoCuotas"
       FROM pr_cuotas WHERE "prestamoId"=$1`,
      [id],
    );
    const saldoCapital  = r2(Number(s.saldoCapital ?? 0));
    const saldoInteres  = r2(Number(s.saldoInteres ?? 0));
    const saldoMora     = r2(Number(s.saldoMora    ?? 0));
    const saldoTotal    = r2(saldoCapital + saldoInteres + saldoMora);
    const cuotasVencidas   = Number(s.cuotasVencidas   ?? 0);
    const cuotasPendientes = Number(s.cuotasPendientes ?? 0);
    const maxDiasMora      = Number(s.maxDiasMora      ?? 0);
    // Préstamo pagado SOLO si saldo=0 Y no quedan cuotas pendientes (doble
    // guard). Para el resto, clasificarMorosidad() decide entre al_dia/
    // moroso/vencido — única definición, compartida con mora.cron.ts y
    // PagosService.registrar(). Antes esta función no aplicaba diasGracia
    // (sí lo hacían las otras dos) — queda unificado.
    const nuevoEstado = (saldoCapital <= 0 && cuotasPendientes === 0)
      ? 'pagado'
      : clasificarMorosidad(cuotasVencidas, maxDiasMora, Number(p.diasGracia ?? 0));
    await this.ds.query(
      `UPDATE pr_prestamos SET "saldoCapital"=$1,"saldoInteres"=$2,"saldoMora"=$3,"saldoTotal"=$4,
        "cuotasVencidas"=$5,estado=$6,"updatedAt"=NOW() WHERE id=$7 AND "empresaId"=$8`,
      [saldoCapital, saldoInteres, saldoMora, saldoTotal, cuotasVencidas, nuevoEstado, id, empresaId],
    );
    return { id, numero: p.numero, saldoCapital, saldoInteres, saldoMora, saldoTotal, estado: nuevoEstado };
  }

  async cancelar(empresaId: number, id: number, motivo?: string) {
    const p = await this.orFail(empresaId, id);
    if (p.estado === 'cancelado') throw new BadRequestException('Préstamo ya cancelado');
    await this.ds.query(
      `UPDATE pr_prestamos SET estado='cancelado', notas=CONCAT(COALESCE(notas,''), ' | Cancelado: ', $1), "updatedAt"=NOW()
       WHERE id=$2 AND "empresaId"=$3`,
      [motivo ?? 'Sin motivo', id, empresaId],
    );
    await this.ds.query(
      `UPDATE pr_deudores SET "prestamosActivos"=GREATEST(0,"prestamosActivos"-1),"updatedAt"=NOW()
       WHERE id=$1 AND "empresaId"=$2`,
      [p.deudorId, empresaId],
    );
    return { success: true };
  }
}
