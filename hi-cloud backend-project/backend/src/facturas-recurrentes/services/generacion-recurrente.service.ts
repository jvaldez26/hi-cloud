import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FacturaRecurrente, FormaPago } from '../entities/factura-recurrente.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { FacturaDetalle } from '../../facturas/entities/factura-detalle.entity';
import { VendedorResolverService } from '../../facturas/vendedor/vendedor-resolver.service';
import {
  ReglaCalendario, siguienteGeneracion, ciclosSaltados, sumarDias, aFechaISO,
} from '../calendario-recurrente';

/** Una línea de la plantilla ya resuelta a importes. */
export interface LineaCalculada {
  descripcion:    string;
  productoId?:    number;
  precioUnitario: number;
  cantidad:       number;
  porcentajeIva:  number;
  subtotal:       number;
  importeIva:     number;
  total:          number;
}

export type ResultadoCiclo =
  | {
      estado:    'generada';
      factura:   Factura;
      folio:     string;
      proxima:   string;
      saltados:  number;
    }
  | { estado: 'omitida'; motivo: string }
  | { estado: 'finalizada' };

/**
 * Genera la factura de un ciclo de una plantilla recurrente.
 *
 * Lo que hace este servicio y no hacía el código anterior:
 *
 *  1. La factura y el avance de la plantilla van en la MISMA transacción. Antes
 *     eran dos escrituras sueltas: una corrida que muriera entre el `save()` de
 *     la factura y el `update()` de proximaEjecucion dejaba la factura creada y
 *     la plantilla apuntando al mismo día — la siguiente corrida la repetía.
 *
 *  2. La guarda de duplicado es el propio UPDATE, con
 *     `WHERE "ultimaEjecucion" IS NULL OR "ultimaEjecucion" < hoy`. Si otra
 *     corrida (el cron, o alguien pulsando "generar ahora") se adelantó, el
 *     UPDATE afecta cero filas y la transacción entera se deshace: no hay
 *     factura duplicada. La protección anterior era accidental — dependía de
 *     que proximaEjecucion ya hubiera avanzado— y no cubría el botón manual.
 *
 *  3. La factura hereda la forma de pago de la plantilla. Antes no se escribía
 *     nada y salía con el CONTADO por defecto de la columna, así que una
 *     recurrente a crédito nunca generaba cuenta por cobrar.
 *
 *  4. La factura lleva vendedor, derivado del dueño de la plantilla.
 */
@Injectable()
export class GeneracionRecurrenteService {
  private readonly logger = new Logger(GeneracionRecurrenteService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly vendedorResolver: VendedorResolverService,
  ) {}

  private regla(rec: FacturaRecurrente): ReglaCalendario {
    return {
      frecuencia:  rec.frecuencia,
      diaMes:      rec.diaMes,
      diaSemana:   rec.diaSemana,
      fechaInicio: aFechaISO(rec.fechaInicio) ?? aFechaISO(rec.proximaEjecucion)!,
    };
  }

  /**
   * Ejecuta un ciclo.
   *
   * `manual` distingue el botón "generar ahora" del barrido del cron: el manual
   * puede adelantarse a la fecha prevista, el cron no.
   */
  async ejecutarCiclo(
    rec: FacturaRecurrente, hoyISO: string, manual = false,
  ): Promise<ResultadoCiclo> {
    const fin = aFechaISO(rec.fechaFin);
    if (fin && fin < hoyISO) {
      await this.ds.getRepository(FacturaRecurrente).update(rec.id, { activa: false });
      this.logger.log(
        `[Recurrentes] "${rec.nombre}" (#${rec.id}) llegó a su fecha de fin (${fin}) — pausada.`,
      );
      return { estado: 'finalizada' };
    }

    // Guarda de duplicado, primera pasada: barata y con un motivo legible. La
    // que de verdad protege contra dos corridas simultáneas es el UPDATE
    // condicional de la transacción, más abajo.
    const ultima = aFechaISO(rec.ultimaEjecucion);
    if (ultima && ultima >= hoyISO) {
      return {
        estado: 'omitida',
        motivo: `Ya se generó una factura de "${rec.nombre}" el ${ultima}.`,
      };
    }

    const prevista = aFechaISO(rec.proximaEjecucion) ?? hoyISO;
    if (!manual && prevista > hoyISO) {
      return { estado: 'omitida', motivo: `Todavía no toca: la próxima es el ${prevista}.` };
    }

    // Ciclos que se perdieron mientras el servidor no corría. Se genera UNA
    // factura, no las N atrasadas —N comprobantes fiscales de golpe por una
    // caída de infraestructura es peor que uno— pero el salto queda contado y
    // se avisa. Nunca en silencio.
    const saltados = manual ? 0 : ciclosSaltados(this.regla(rec), prevista, hoyISO);

    const lineas = await this.calcularLineas(rec.detalles, rec.empresaId!, rec.nombre);
    if (lineas.length === 0) {
      return {
        estado: 'omitida',
        motivo: `La plantilla "${rec.nombre}" no tiene ítems: no hay nada que facturar.`,
      };
    }

    // El vendedor se resuelve fuera de la transacción: son sólo lecturas y el
    // resolver puede acumular alertas por su cuenta.
    const { vendedorId, nombreVendedor } = await this.vendedorResolver.resolverVendedor(
      {}, rec.userId, rec.empresaId!,
    );

    const proxima = siguienteGeneracion(this.regla(rec), hoyISO);

    const resultado = await this.ds.transaction(async (manager) => {
      // ── El avance de la plantilla va PRIMERO, y es el que decide ──────────
      //
      // Si otra corrida ya generó hoy, este UPDATE toca cero filas y salimos
      // sin haber creado nada. Ponerlo antes del INSERT evita gastar un folio
      // en una transacción que sabemos que se va a deshacer.
      const avance = await manager.query<{ id: number }[]>(
        `UPDATE facturas_recurrentes
            SET "ultimaEjecucion"  = $2::date,
                "proximaEjecucion" = $3::date,
                "totalGeneradas"   = "totalGeneradas" + 1,
                "ciclosSaltados"   = "ciclosSaltados" + $4,
                "ultimoError"      = NULL,
                "ultimoErrorAt"    = NULL,
                "updatedAt"        = now()
          WHERE id = $1
            AND ("ultimaEjecucion" IS NULL OR "ultimaEjecucion" < $2::date)
        RETURNING id`,
        [rec.id, hoyISO, proxima, saltados],
      );
      if (!avance.length) return null;

      const factura = await this.insertarFactura(
        manager, rec, hoyISO, lineas, vendedorId, nombreVendedor,
      );
      return factura;
    });

    if (!resultado) {
      return {
        estado: 'omitida',
        motivo: `Otra ejecución generó "${rec.nombre}" en paralelo — no se duplica.`,
      };
    }

    if (saltados > 0) {
      this.logger.warn(
        `[Recurrentes] "${rec.nombre}" (#${rec.id}) se saltó ${saltados} ciclo(s): ` +
        `tocaba el ${prevista} y se generó hoy ${hoyISO}. Se genera UNA factura ` +
        `(${resultado.folio}); las atrasadas, si hacen falta, van a mano.`,
      );
    }

    this.logger.log(
      `[Recurrentes] "${rec.nombre}" → ${resultado.folio} | total=${resultado.total} | ` +
      `vendedor=${vendedorId ?? 'sin resolver'} | próxima ${proxima}`,
    );

    return { estado: 'generada', factura: resultado, folio: resultado.folio, proxima, saltados };
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Totales de la plantilla, con caída al precio actual del producto cuando el
   * precio guardado es 0 (plantillas viejas creadas antes de que el formulario
   * exigiera precio).
   *
   * El JSON puede devolver los números como cadenas, de ahí el parseFloat(String()).
   */
  async calcularLineas(
    detalles: FacturaRecurrente['detalles'], empresaId: number, nombre = 'plantilla',
  ): Promise<LineaCalculada[]> {
    const raw = Array.isArray(detalles) ? detalles : [];
    const lineas: LineaCalculada[] = [];

    for (let idx = 0; idx < raw.length; idx++) {
      const d = raw[idx] as any;
      let precio = parseFloat(String(d.precioUnitario ?? d.precio ?? 0)) || 0;

      if (precio === 0 && d.productoId) {
        const [prod] = await this.ds.query<{ precio: string }[]>(
          `SELECT precio FROM productos
            WHERE id = $1 AND "isActive" = true AND "empresaId" = $2 LIMIT 1`,
          [d.productoId, empresaId],
        );
        if (prod?.precio) {
          precio = parseFloat(String(prod.precio)) || 0;
          this.logger.log(
            `[Recurrentes] "${nombre}" ítem ${idx + 1}: precio 0 en la plantilla → ` +
            `precio actual del producto #${d.productoId}: ${precio}`,
          );
        }
      }

      const cantidad    = parseFloat(String(d.cantidad ?? 1)) || 1;
      const pctIva      = parseFloat(String(d.porcentajeIva ?? d.iva ?? 0)) || 0;
      const descripcion = String(d.descripcion ?? d.concepto ?? d.nombre ?? '').trim()
        || `Ítem ${idx + 1}`;
      const sub    = +(precio * cantidad).toFixed(2);
      const impIva = +(sub * (pctIva / 100)).toFixed(2);

      lineas.push({
        descripcion:    descripcion.substring(0, 200),
        productoId:     d.productoId != null ? Number(d.productoId) : undefined,
        precioUnitario: precio,
        cantidad,
        porcentajeIva:  pctIva,
        subtotal:       sub,
        importeIva:     impIva,
        total:          +(sub + impIva).toFixed(2),
      });
    }

    return lineas;
  }

  /**
   * Inserta cabecera y detalles, y deja los totales cuadrados desde la BD.
   *
   * La forma de pago de la plantilla se escribe en los tres sitios que la
   * necesitan, no en uno: `tipoPago` es lo que mira cambiarEstado() para crear
   * la cuenta por cobrar, `formasPago` es lo que lee el desglose de caja, y
   * `fechaVencimiento` sale de la fecha de generación más el plazo.
   */
  private async insertarFactura(
    manager:        EntityManager,
    rec:            FacturaRecurrente,
    hoyISO:         string,
    lineas:         LineaCalculada[],
    vendedorId:     number | null,
    nombreVendedor: string | null,
  ): Promise<Factura> {
    const [{ numero }] = await manager.query<{ numero: number }[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
      [rec.empresaId, 'FAC'],
    );
    const folio = `FAC-${numero}`;

    const subtotal = +lineas.reduce((s, l) => s + l.subtotal, 0).toFixed(2);
    const iva      = +lineas.reduce((s, l) => s + l.importeIva, 0).toFixed(2);
    const total    = +(subtotal + iva).toFixed(2);

    const esCredito = rec.formaPago === FormaPago.CREDITO;
    const dias      = esCredito ? Number(rec.diasCredito ?? 0) : 0;

    const factura = await manager.save(Factura, manager.create(Factura, {
      empresaId:           rec.empresaId,
      folio,
      fecha:               hoyISO as unknown as Date,
      estado:              FacturaEstado.BORRADOR,
      clienteId:           rec.clienteId,
      usuarioId:           rec.userId,
      // Quién vendió el contrato. A diferencia de otros crones, en una
      // recurrente sí hay a quién imputar: el dueño de la plantilla.
      vendedorId:          vendedorId     ?? undefined,
      nombreVendedor:      nombreVendedor ?? undefined,
      tipoNcf:             rec.tipoEcf ?? 'E32',
      notas:               `Factura recurrente: ${rec.nombre}`,
      subtotal,
      iva,
      total,
      netoCobrar:          total,
      tipoPago:            esCredito ? 'CREDITO' : 'CONTADO',
      diasCredito:         dias,
      fechaVencimiento:    esCredito
        ? (sumarDias(hoyISO, dias) as unknown as Date)
        : undefined,
      formasPago:          [{ tipo: rec.formaPago, monto: total }],
      facturaRecurrenteId: rec.id,
    }));

    await manager.save(FacturaDetalle, lineas.map(l =>
      manager.create(FacturaDetalle, { ...l, facturaId: factura.id }),
    ));

    // Cuadrar contra lo insertado: cubre cualquier diferencia de redondeo entre
    // el JSON de la plantilla y las columnas decimal de la BD.
    await manager.query(
      `UPDATE facturas f
          SET subtotal = t.sub, iva = t.iva, total = t.tot,
              "netoCobrar" = t.tot
         FROM (SELECT COALESCE(SUM(subtotal), 0)      AS sub,
                      COALESCE(SUM("importeIva"), 0)  AS iva,
                      COALESCE(SUM(total), 0)         AS tot
                 FROM factura_detalles
                WHERE "facturaId" = $1 AND "isActive" = true) t
        WHERE f.id = $1`,
      [factura.id],
    );

    // Y que formasPago siga sumando el total exacto: el desglose de caja
    // reparte proporcionalmente y una diferencia de céntimos se propaga.
    await manager.query(
      `UPDATE facturas
          SET "formasPago" = jsonb_build_array(jsonb_build_object('tipo', $2::int, 'monto', total))
        WHERE id = $1`,
      [factura.id, rec.formaPago],
    );

    return await manager.findOneOrFail(Factura, { where: { id: factura.id } });
  }
}
