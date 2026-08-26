import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { reportServiceError } from '../../common/observability/sentry';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

/**
 * Unico sitio donde se decide a quien se le imputa una venta.
 *
 * Vivia dentro de FacturasService y por eso solo protegia create(): los otros
 * seis caminos que crean facturas (cotizacion, pre-factura, contrato, orden de
 * servicio, factura recurrente, comanda de restaurante y duplicar) nunca lo
 * llamaban, y llevaban meses produciendo facturas sin vendedor. 249 en 11
 * empresas al 2026-08-26 - ver docs/estado-actual.md seccion 1.
 *
 * Sacarlo aqui permite que TODOS lo llamen sin arrastrar FacturasModule entero
 * (ECF, CxC, Contabilidad, Caja...) ni montar dependencias circulares.
 *
 * No lee el CLS: recibe usuarioId y empresaId como parametros explicitos, asi
 * que tambien es seguro llamarlo desde un cron.
 */
@Injectable()
export class VendedorResolverService implements OnModuleDestroy {
  private readonly logger = new Logger(VendedorResolverService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ── Vendedor: se deriva, no se acepta a ciegas ────────────────────────────

  /**
   * Resuelve a quién se le imputa la venta.
   *
   * El vendedor NO es un dato del cliente. El POS lo mandaba desde localStorage
   * y, cuando ese localStorage se perdía (cambio de usuario, terminal que nunca
   * abrió turno), la factura se grababa con vendedorId NULL. Como el cierre de
   * caja reúne las ventas por vendedorId + fecha, esas facturas desaparecían del
   * cuadre sin que saltara nada: caja #446 de FERRETERIA PAVEL, 5 de 16 facturas
   * y RD$16.574,99 fuera del arqueo.
   *
   * Orden de resolución:
   *   1. Si el usuario autenticado tiene un vendedor asociado, ese manda y lo que
   *      venga en el dto se ignora. El navegador no decide a quién se le imputa
   *      una venta.
   *   2. Si no lo tiene, se respeta el dto —pero comprobando que el vendedor
   *      exista y sea de esta empresa; hasta ahora entraba cualquier id—. La
   *      mayoría de empresas todavía no ligan sus vendedores a usuarios
   *      (vendedores.usuarioId está vacío), y ahí el dto es el único dato que hay:
   *      imponer el derivado les borraría la atribución a miles de facturas.
   *   3. Si no hay forma de resolverlo, la factura se emite igual —nunca se
   *      bloquea una venta por esto— pero deja de ser silencioso.
   */
  async resolverVendedor(
    dto:       { vendedorId?: number; nombreVendedor?: string },
    usuarioId: number,
    empresaId: number,
  ): Promise<{ vendedorId: number | null; nombreVendedor: string | null }> {
    const [derivado] = await this.dataSource.query<{ id: number; nombre: string }[]>(
      `SELECT id, nombre
         FROM vendedores
        WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true
        ORDER BY activo DESC, id ASC
        LIMIT 1`,
      [usuarioId, empresaId],
    );

    if (derivado) {
      if (dto.vendedorId != null && Number(dto.vendedorId) !== derivado.id) {
        this.logger.warn(
          `Factura del usuario #${usuarioId} (empresa ${empresaId}) llegó con ` +
          `vendedorId=${dto.vendedorId}; se imputa al vendedor #${derivado.id}, ` +
          `que es el asociado a ese usuario.`,
        );
      }
      return { vendedorId: derivado.id, nombreVendedor: derivado.nombre };
    }

    if (dto.vendedorId != null) {
      const [delDto] = await this.dataSource.query<{ id: number; nombre: string }[]>(
        `SELECT id, nombre
           FROM vendedores
          WHERE id = $1 AND "empresaId" = $2 AND "isActive" = true
          LIMIT 1`,
        [Number(dto.vendedorId), empresaId],
      );
      if (delDto) return { vendedorId: delDto.id, nombreVendedor: delDto.nombre };

      this.logger.warn(
        `vendedorId=${dto.vendedorId} no existe en la empresa ${empresaId}; se descarta.`,
      );
    }

    this.acumularFacturaSinVendedor(empresaId, usuarioId);
    return { vendedorId: null, nombreVendedor: dto.nombreVendedor ?? null };
  }

  // ── Alertas agrupadas de facturas sin vendedor ────────────────────────────
  //
  // Un evento por factura convierte siete avisos al día en ruido que nadie mira
  // en una semana. Se acumulan por empresa y día, y se emite UNO solo con el
  // conteo: 15 min después de la última afectada, o al cabo de una hora desde la
  // primera si la ráfaga no para.

  private static readonly SIN_VENDEDOR_DEBOUNCE_MS   = 15 * 60_000;
  private static readonly SIN_VENDEDOR_MAX_ESPERA_MS = 60 * 60_000;

  private readonly sinVendedorBuffer = new Map<string, {
    empresaId: number;
    fecha:     string;
    facturas:  number;
    usuarios:  Set<number>;
    primerHit: number;
    timer:     ReturnType<typeof setTimeout>;
  }>();

  private acumularFacturaSinVendedor(empresaId: number, usuarioId: number) {
    const fecha = fechaHoyRD();
    const clave = `${empresaId}:${fecha}`;
    const acc   = this.sinVendedorBuffer.get(clave);

    if (acc) {
      acc.facturas += 1;
      acc.usuarios.add(usuarioId);
      // Se reprograma mientras sigan llegando, pero con tope: una ráfaga que dure
      // todo el día no puede retrasar el aviso hasta que ya no sirva de nada.
      if (Date.now() - acc.primerHit < VendedorResolverService.SIN_VENDEDOR_MAX_ESPERA_MS) {
        clearTimeout(acc.timer);
        acc.timer = this.programarFlushSinVendedor(clave);
      }
      return;
    }

    this.sinVendedorBuffer.set(clave, {
      empresaId,
      fecha,
      facturas:  1,
      usuarios:  new Set([usuarioId]),
      primerHit: Date.now(),
      timer:     this.programarFlushSinVendedor(clave),
    });
  }

  private programarFlushSinVendedor(clave: string) {
    const t = setTimeout(
      () => this.emitirAlertaSinVendedor(clave),
      VendedorResolverService.SIN_VENDEDOR_DEBOUNCE_MS,
    );
    t.unref?.();   // un aviso pendiente no debe mantener vivo el proceso
    return t;
  }

  private emitirAlertaSinVendedor(clave: string) {
    const acc = this.sinVendedorBuffer.get(clave);
    if (!acc) return;
    this.sinVendedorBuffer.delete(clave);
    clearTimeout(acc.timer);

    const usuarios = [...acc.usuarios].sort((a, b) => a - b);
    reportServiceError(
      new Error(
        `${acc.facturas} factura(s) sin vendedor en la empresa ${acc.empresaId} el ${acc.fecha}. ` +
        `No entran en ningún cierre de caja. Usuario(s): ${usuarios.join(', ')}. ` +
        `Se arregla poblando vendedores."usuarioId" para esos usuarios.`,
      ),
      'facturas.sinVendedor',
      {
        empresaId: acc.empresaId,
        fecha:     acc.fecha,
        facturas:  acc.facturas,
        usuarios:  usuarios.join(','),
      },
    );
  }

  /** Al apagar, no perder lo que quede en el buffer. */
  onModuleDestroy() {
    for (const clave of [...this.sinVendedorBuffer.keys()]) {
      this.emitirAlertaSinVendedor(clave);
    }
  }
}
