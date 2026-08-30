import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FacturaRecurrente } from '../entities/factura-recurrente.entity';
import { Factura, FacturaEstado } from '../../facturas/entities/factura.entity';
import { FacturasService } from '../../facturas/facturas.service';
import { TenantService } from '../../tenant/tenant.service';
import { RncService } from '../../rnc/rnc.service';
import {
  esCreditoFiscal, evaluarCompradorFiscal,
} from '../../ecf/rules/comprador-vigente.rule';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { TIPOS_ECF_VENTA } from '../dto/factura-recurrente.dto';

/** Tipos que exigen SIEMPRE el RNC del comprador (ver los builders e31/e41/e44/e45/e46). */
const TIPOS_RNC_OBLIGATORIO = [31, 41, 44, 45, 46];

/** A partir de este importe, una E32 también exige RNC (e32.builder.ts). */
const E32_MONTO_RNC_OBLIGATORIO = 250_000;

/** ITBIS que admite una E32. */
const E32_PORCENTAJES_VALIDOS = [0, 16, 18];

export type ResultadoEmision =
  | { ok: true;  encf: string | null; estado: string }
  | { ok: false; motivo: string; fase: 'previa' | 'envio' };

/**
 * Emite el comprobante fiscal de una factura recurrente.
 *
 * ── Nada se pide antes de estar seguro ────────────────────────────────────
 *
 * El caso de uso de emisión ya garantiza que un número emitido SIEMPRE tiene
 * su fila: construye el payload dos veces —la primera con un eNCF de marcador,
 * sólo para correr las validaciones de los builders— y mete el incremento de la
 * secuencia y el INSERT del e-CF en una única transacción. Eso no se reimplementa
 * aquí; se apoya en ello.
 *
 * Lo que sí hace este servicio es comprobar ANTES de tocar nada las cosas que
 * un cron no puede resolver solo, porque no hay nadie delante a quien
 * preguntarle: que la empresa tenga configuración de MSeller, que la secuencia
 * del tipo elegido tenga números y no esté vencida, y que el comprador tenga el
 * RNC que ese tipo exige y esté vigente ante la DGII. Si algo de eso falla, la
 * factura se queda en BORRADOR con el motivo escrito en sus notas, la plantilla
 * guarda el error y se avisa. No se pide número, no se emite nada a medias, y
 * al día siguiente alguien lo corrige y la emite a mano.
 *
 * ── Lo que queda fuera de la comprobación previa ──────────────────────────
 *
 * Una regla de builder que no esté replicada aquí (son siete builders) puede
 * hacer fallar la construcción del payload. Ahí la factura ya habrá pasado a
 * EMITIDA —porque cambiarEstado() mueve el estado antes de emitir, y con él el
 * inventario, la cuenta por cobrar y el asiento— pero la secuencia SIGUE
 * intacta: ese fallo ocurre en la construcción en seco. Queda una factura
 * emitida sin comprobante, que es un estado visible y recuperable desde el
 * botón de emitir del listado de facturas, y el motivo se avisa igual.
 */
@Injectable()
export class EmisionRecurrenteService {
  private readonly logger = new Logger(EmisionRecurrenteService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly facturasService: FacturasService,
    private readonly tenantService:   TenantService,
    private readonly rncService:      RncService,
  ) {}

  /**
   * Tipos de e-CF que esta empresa puede emitir HOY: los que tienen secuencia
   * activa, con números y sin vencer.
   *
   * El selector de la plantilla se llena con esto en vez de con la lista fija
   * de tipos: ofrecer un E44 a una empresa que no tiene secuencia de E44 es
   * ofrecer una plantilla que va a fallar el primer día que corra.
   */
  async tiposDisponibles(empresaId: number): Promise<Array<{
    codigo: string; nombre: string; disponibles: number; vence: string;
  }>> {
    return this.ds.query(
      `SELECT t.codigo,
              t.descripcion                               AS nombre,
              (s."secuenciaFinal" - s."secuenciaActual" + 1) AS disponibles,
              to_char(s."fechaVencimiento", 'YYYY-MM-DD')  AS vence
         FROM secuencias_ecf s
         JOIN tipos_ecf t ON t.id = s."tipoECFId"
        WHERE s."empresaId" = $1
          AND s."isActive" = true AND s."isActiva" = true AND s."isAgotada" = false
          AND s."secuenciaActual" <= s."secuenciaFinal"
          AND s."fechaVencimiento" >= $3::date
          AND t.codigo = ANY($2::text[])
        ORDER BY t.codigo`,
      [empresaId, TIPOS_ECF_VENTA, fechaHoyRD()],
    );
  }

  /**
   * Las mismas comprobaciones previas, pero sin emitir nada: lo que la vista
   * previa enseña antes de guardar la plantilla.
   */
  async avisosDe(
    rec: FacturaRecurrente, facturaSimulada: Factura,
  ): Promise<string | null> {
    const tipoEcfNum = parseInt(String(rec.tipoEcf ?? 'E32').replace('E', ''), 10);
    return this.comprobacionesPrevias(rec, facturaSimulada, tipoEcfNum, rec.empresaId!);
  }

  async emitir(rec: FacturaRecurrente, factura: Factura): Promise<ResultadoEmision> {
    const empresaId  = rec.empresaId!;
    const tipoEcfNum = parseInt(String(rec.tipoEcf ?? 'E32').replace('E', ''), 10);

    const previa = await this.comprobacionesPrevias(rec, factura, tipoEcfNum, empresaId);
    if (previa) {
      this.logger.warn(
        `[Recurrentes] "${rec.nombre}" → ${factura.folio} NO se emite (${rec.tipoEcf}): ${previa}`,
      );
      await this.dejarEnBorradorConMotivo(factura, previa);
      return { ok: false, motivo: previa, fase: 'previa' };
    }

    // A partir de aquí la emisión corre con el contexto de empresa puesto: la
    // cadena cambiarEstado → inventario → CxC → asiento lee empresaId del CLS,
    // y en un cron el CLS está vacío.
    try {
      const resultado = await this.tenantService.runForEmpresa(empresaId, () =>
        this.facturasService.cambiarEstado(
          factura.id,
          FacturaEstado.EMITIDA,
          // Sincrónico: queremos saber si salió para poder avisarlo hoy, no
          // enterarnos por los logs mañana.
          true,
          tipoEcfNum,
        ),
      ) as any;

      if (resultado?.ecfEmitido === false) {
        const motivo = String(resultado.ecfError ?? 'Error desconocido al emitir el e-CF');
        this.logger.error(
          `[Recurrentes] "${rec.nombre}" → ${factura.folio}: el envío del e-CF falló — ${motivo}`,
        );
        return { ok: false, motivo, fase: 'envio' };
      }

      const encf = resultado?.encf ?? resultado?.ecf?.numero ?? null;
      this.logger.log(
        `[Recurrentes] "${rec.nombre}" → ${factura.folio} emitida con ${encf ?? rec.tipoEcf}`,
      );
      return { ok: true, encf, estado: resultado?.estado ?? 'enviado' };
    } catch (err) {
      const motivo = (err as Error).message;
      this.logger.error(
        `[Recurrentes] "${rec.nombre}" → ${factura.folio}: emisión abortada — ${motivo}`,
      );
      return { ok: false, motivo, fase: 'envio' };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  /** Devuelve el motivo por el que NO se puede emitir, o null si todo encaja. */
  private async comprobacionesPrevias(
    rec: FacturaRecurrente, factura: Factura, tipoEcfNum: number, empresaId: number,
  ): Promise<string | null> {
    if (!rec.tipoEcf || Number.isNaN(tipoEcfNum)) {
      return 'La plantilla está marcada para emitir con e-CF pero no tiene tipo de comprobante.';
    }

    // ── 1. Configuración de MSeller ─────────────────────────────────────────
    const [config] = await this.ds.query<{
      rncEmisor: string | null; razonSocialEmisor: string | null;
      bloqueadoHasta: Date | null;
    }[]>(
      `SELECT "rncEmisor", "razonSocialEmisor", "bloqueadoHasta"
         FROM empresa_ecf_config
        WHERE "empresaId" = $1 AND activo = true AND "isActive" = true
        LIMIT 1`,
      [empresaId],
    );
    if (!config) {
      return 'La empresa no tiene configuración de comprobantes fiscales activa (MSeller).';
    }
    if (!config.rncEmisor || !config.razonSocialEmisor) {
      return 'La configuración de comprobantes fiscales no tiene RNC o razón social del emisor.';
    }
    if (config.bloqueadoHasta && new Date(config.bloqueadoHasta) > new Date()) {
      return (
        `La emisión de comprobantes está bloqueada hasta ` +
        `${new Date(config.bloqueadoHasta).toLocaleString('es-DO')}.`
      );
    }

    // ── 2. Secuencia del tipo elegido ───────────────────────────────────────
    const codigo = `E${String(tipoEcfNum).padStart(2, '0')}`;
    const [sec] = await this.ds.query<{
      disponibles: number; vence: string; vencida: boolean;
    }[]>(
      `SELECT (s."secuenciaFinal" - s."secuenciaActual" + 1) AS disponibles,
              to_char(s."fechaVencimiento", 'YYYY-MM-DD')    AS vence,
              (s."fechaVencimiento" < $3::date)              AS vencida
         FROM secuencias_ecf s
         JOIN tipos_ecf t ON t.id = s."tipoECFId"
        WHERE s."empresaId" = $1 AND t.codigo = $2
          AND s."isActive" = true AND s."isActiva" = true AND s."isAgotada" = false
        ORDER BY s."createdAt" DESC
        LIMIT 1`,
      [empresaId, codigo, fechaHoyRD()],
    );
    if (!sec) {
      return `La empresa no tiene una secuencia activa de ${codigo}.`;
    }
    if (Number(sec.disponibles) <= 0) {
      return `La secuencia de ${codigo} está agotada: no quedan números disponibles.`;
    }
    if (sec.vencida) {
      return `La secuencia de ${codigo} venció el ${sec.vence}.`;
    }

    // ── 3. RNC del comprador cuando el tipo lo exige ────────────────────────
    const cliente = (factura.cliente ?? {}) as any;
    const rnc = String(cliente.rncReceptor ?? cliente.rfc ?? '').trim();

    if (!rnc && TIPOS_RNC_OBLIGATORIO.includes(tipoEcfNum)) {
      return (
        `${codigo} exige el RNC del comprador y el cliente "${cliente.nombre ?? factura.clienteId}" ` +
        `no lo tiene en su ficha.`
      );
    }
    if (!rnc && tipoEcfNum === 32 && Number(factura.total) >= E32_MONTO_RNC_OBLIGATORIO) {
      return (
        `Una E32 de RD$${Number(factura.total).toLocaleString('es-DO')} exige el RNC del ` +
        `comprador (a partir de RD$${E32_MONTO_RNC_OBLIGATORIO.toLocaleString('es-DO')}) y el ` +
        `cliente no lo tiene en su ficha.`
      );
    }

    // ── 4. ITBIS que admite una E32 ─────────────────────────────────────────
    if (tipoEcfNum === 32) {
      const raro = (rec.detalles ?? []).find(d => {
        const pct = parseFloat(String(d.porcentajeIva ?? 18));
        return !E32_PORCENTAJES_VALIDOS.includes(pct);
      });
      if (raro) {
        return (
          `El ítem "${raro.descripcion}" tiene un ITBIS de ${raro.porcentajeIva}%, que una E32 ` +
          `no admite (sólo 0, 16 o 18).`
        );
      }
    }

    // ── 5. RNC vigente ante la DGII ─────────────────────────────────────────
    //
    // Un RNC suspendido no impide emitir: se advierte y quien está delante
    // decide. Pero en un cron no hay nadie delante, así que la decisión se
    // aplaza a una persona en vez de tomarse sola. Falla ABIERTA igual que en
    // el resto del sistema: si el padrón no responde o no encuentra el RNC, se
    // emite — un servicio de terceros caído no puede frenar la facturación.
    if (rnc && esCreditoFiscal(tipoEcfNum)) {
      const padron = await this.rncService.consultarRNC(rnc).catch(() => null);
      const veredicto = evaluarCompradorFiscal(tipoEcfNum, padron, false);
      if (veredicto.bloquear) {
        return (
          `El RNC ${rnc} figura como ${veredicto.estado} ante la DGII. Una recurrente no ` +
          `puede confirmar eso sola: emítela a mano si la situación está resuelta, o cambia ` +
          `la plantilla a Factura de Consumo (E32).`
        );
      }
    }

    return null;
  }

  /**
   * La factura se queda como está —en borrador— y el motivo se escribe en sus
   * notas, para que quien la abra mañana sepa por qué no salió sin tener que
   * cruzar logs.
   */
  private async dejarEnBorradorConMotivo(factura: Factura, motivo: string): Promise<void> {
    await this.ds.query(
      `UPDATE facturas
          SET notas = $2, "updatedAt" = now()
        WHERE id = $1`,
      [
        factura.id,
        `${factura.notas ?? ''}\n⚠ No se emitió el comprobante fiscal: ${motivo}`.trim(),
      ],
    ).catch(err =>
      this.logger.warn(
        `[Recurrentes] No se pudo anotar el motivo en la factura #${factura.id}: ${err?.message}`,
      ),
    );
  }
}
