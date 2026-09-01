import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductoProveedor } from './entities/producto-proveedor.entity';
import { TenantService } from '../tenant/tenant.service';

/** Fila de la pantalla «qué le falta a este proveedor». */
export interface LineaReposicion {
  vinculoId:        number;
  productoId:       number;
  codigo:           string;
  nombre:           string;
  unidadMedida:     string;
  codigoProveedor:  string | null;
  esPreferente:     boolean;
  existencia:       number;
  minimo:           number;
  /** De dónde salió el mínimo. 'sin-configurar' explica un faltante 0 que podría extrañar. */
  origenMinimo:     'almacen' | 'producto' | 'sin-configurar';
  faltante:         number;
  cantidadSugerida: number;
  /** 'plan' si la sugerencia viene de planeación de demanda; 'faltante' si es el hueco simple. */
  origenSugerencia: 'plan' | 'faltante';
  precioPactado:    number | null;
  monedaPactada:    string;
  precioPactadoAt:  string | null;
  /** true mientras el precio venga del historial y no lo haya confirmado una persona. */
  precioEsEstimado: boolean;
  diasEntrega:      number | null;
  pedidoMinimo:     number | null;
  multiploEmpaque:  number | null;
}

@Injectable()
export class ProductoProveedorService {
  private readonly logger = new Logger(ProductoProveedorService.name);

  constructor(
    @InjectRepository(ProductoProveedor)
    private readonly repo: Repository<ProductoProveedor>,
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Los productos de un proveedor, con lo que falta EN UN ALMACÉN CONCRETO.
   *
   * El almacén es obligatorio y lo resuelve el controlador. No hay respaldo al
   * stock global a propósito: el caso de uso es el proveedor parado en una
   * sucursal preguntando qué falta ahí, y enseñarle el total de la empresa es
   * el número equivocado dicho con confianza. Si no hay almacén, se pregunta.
   */
  async listarPorProveedor(proveedorId: number, almacenId: number): Promise<LineaReposicion[]> {
    const empresaId = this.tenantService.getEmpresaId();

    const filas = await this.dataSource.query<any[]>(
      `
      SELECT pp."id"                AS "vinculoId",
             p."id"                 AS "productoId",
             p."codigo",
             p."nombre",
             p."unidadMedida",
             pp."codigoProveedor",
             pp."esPreferente",
             pp."precioPactado",
             pp."monedaPactada",
             pp."precioPactadoAt",
             pp."origen",
             pp."diasEntrega",
             pp."pedidoMinimo",
             pp."multiploEmpaque",
             COALESCE(sa."stock", 0)                                   AS "existencia",
             -- El mínimo del almacén manda; si no hay fila o vale 0, cae al del
             -- producto. Sin este COALESCE la pantalla nacería inútil:
             -- stock_almacen."stockMinimo" es DEFAULT 0, así que todo producto
             -- sin mínimo por almacén daría faltante 0 — "no falta nada" — en
             -- silencio y para casi todo el catálogo.
             COALESCE(NULLIF(sa."stockMinimo", 0), p."stockMinimo", 0) AS "minimo",
             CASE
               WHEN NULLIF(sa."stockMinimo", 0) IS NOT NULL THEN 'almacen'
               WHEN COALESCE(p."stockMinimo", 0) > 0        THEN 'producto'
               ELSE 'sin-configurar'
             END                                                       AS "origenMinimo",
             pl."cantidadSugeridaCompra"                               AS "sugeridaPlan"
        FROM "producto_proveedor" pp
        JOIN "productos" p
          ON p."id" = pp."productoId"
       AND p."isActive" = TRUE
        LEFT JOIN "stock_almacen" sa
          ON sa."productoId" = p."id"
         AND sa."almacenId"  = $3
        -- Línea del plan de demanda más reciente de la empresa, si lo hay.
        LEFT JOIN LATERAL (
          SELECT l."cantidadSugeridaCompra"
            FROM "plan_demanda_lineas" l
            JOIN "planes_demanda" pd ON pd."id" = l."planId"
           WHERE l."productoId" = p."id"
             AND l."empresaId"  = $1
             AND l."isActive"   = TRUE
             AND pd."isActive"  = TRUE
           ORDER BY pd."id" DESC
           LIMIT 1
        ) pl ON TRUE
       WHERE pp."empresaId"   = $1
         AND pp."proveedorId" = $2
         AND pp."isActive"    = TRUE
       ORDER BY p."nombre" ASC
      `,
      [empresaId, proveedorId, almacenId],
    );

    return filas.map(f => this.aLinea(f));
  }

  /**
   * Calcula faltante y sugerencia.
   *
   * `pedidoMinimo` y `multiploEmpaque` son reglas distintas y se aplican en este
   * orden: primero se sube al mínimo que el proveedor acepta, después se redondea
   * al múltiplo en que lo vende. Al revés, un mínimo de 6 con empaque de 4 daría
   * 4 — por debajo del mínimo. Ambos nulos = sin regla: el faltante sin redondear.
   */
  private aLinea(f: any): LineaReposicion {
    const existencia = Number(f.existencia ?? 0);
    const minimo     = Number(f.minimo ?? 0);
    const faltante   = Math.max(0, minimo - existencia);

    const pedidoMinimo    = f.pedidoMinimo    != null ? Number(f.pedidoMinimo)    : null;
    const multiploEmpaque = f.multiploEmpaque != null ? Number(f.multiploEmpaque) : null;
    const sugeridaPlan    = f.sugeridaPlan    != null ? Number(f.sugeridaPlan)    : null;

    // La planeación de demanda ya proyecta ventas a 3 meses y tiene en cuenta la
    // tendencia; si hay un número suyo para este producto, es mejor que el hueco
    // simple. Solo se usa cuando aporta algo (> 0).
    const usaPlan = sugeridaPlan != null && sugeridaPlan > 0;
    let cantidad  = usaPlan ? sugeridaPlan : faltante;

    if (cantidad > 0) {
      if (pedidoMinimo    != null && pedidoMinimo    > 0) cantidad = Math.max(cantidad, pedidoMinimo);
      if (multiploEmpaque != null && multiploEmpaque > 0) {
        cantidad = Math.ceil(cantidad / multiploEmpaque) * multiploEmpaque;
      }
    }

    return {
      vinculoId:        Number(f.vinculoId),
      productoId:       Number(f.productoId),
      codigo:           f.codigo,
      nombre:           f.nombre,
      unidadMedida:     f.unidadMedida,
      codigoProveedor:  f.codigoProveedor ?? null,
      esPreferente:     f.esPreferente === true,
      existencia,
      minimo,
      origenMinimo:     f.origenMinimo,
      faltante,
      cantidadSugerida: this.redondear(cantidad),
      origenSugerencia: usaPlan ? 'plan' : 'faltante',
      precioPactado:    f.precioPactado != null ? Number(f.precioPactado) : null,
      monedaPactada:    f.monedaPactada ?? 'DOP',
      precioPactadoAt:  f.precioPactadoAt ? String(f.precioPactadoAt) : null,
      // Mientras no lo confirme una persona, el precio es el último costo pagado,
      // no un compromiso del proveedor. La pantalla debe decirlo.
      precioEsEstimado: f.origen !== 'manual',
      diasEntrega:      f.diasEntrega != null ? Number(f.diasEntrega) : null,
      pedidoMinimo,
      multiploEmpaque,
    };
  }

  /** 4 decimales, como las columnas de cantidad del esquema. */
  private redondear(n: number): number {
    return Math.round(n * 10_000) / 10_000;
  }

  // ── Altas y ediciones ───────────────────────────────────────────────────────

  /**
   * Vincula productos a un proveedor. Es el caso que motiva toda la función:
   * el proveedor vende algo que nunca le has comprado, así que el historial no
   * lo conoce y alguien tiene que decirlo.
   *
   * Se marca `origen='manual'`, que además protege la fila de los procesos
   * automáticos.
   */
  async vincular(
    proveedorId: number,
    productoIds: number[],
    datos?: Partial<Pick<ProductoProveedor,
      'codigoProveedor' | 'precioPactado' | 'monedaPactada' | 'diasEntrega' |
      'pedidoMinimo' | 'multiploEmpaque' | 'notas'>>,
  ): Promise<{ creados: number; yaExistian: number }> {
    const empresaId = this.tenantService.getEmpresaId();
    if (productoIds.length === 0) return { creados: 0, yaExistian: 0 };

    let creados = 0;
    for (const productoId of productoIds) {
      // Reactivar en vez de duplicar: el par pudo desvincularse antes y el UNIQUE
      // cubre también las filas inactivas.
      const existente = await this.repo.findOne({ where: { empresaId, productoId, proveedorId } });

      if (existente) {
        if (!existente.isActive) {
          await this.repo.update(existente.id, { isActive: true, origen: 'manual', ...datos });
          creados++;
        }
        continue;
      }

      await this.repo.save(this.repo.create({
        empresaId, productoId, proveedorId,
        origen: 'manual',
        monedaPactada: datos?.monedaPactada ?? 'DOP',
        precioPactadoAt: datos?.precioPactado != null ? new Date() : null,
        ...datos,
      }));
      creados++;
    }

    return { creados, yaExistian: productoIds.length - creados };
  }

  async actualizar(id: number, datos: Partial<ProductoProveedor>): Promise<ProductoProveedor> {
    const empresaId = this.tenantService.getEmpresaId();
    const vinculo = await this.repo.findOne({ where: { id, empresaId } });
    if (!vinculo) throw new NotFoundException(`Vínculo #${id} no encontrado`);

    // Tocar el precio lo convierte en un dato confirmado por una persona: deja de
    // ser el costo histórico estimado y pasa a ser un precio pactado, con su fecha.
    const cambiaPrecio = datos.precioPactado !== undefined
      && Number(datos.precioPactado) !== Number(vinculo.precioPactado);

    await this.repo.update(id, {
      ...datos,
      ...(cambiaPrecio ? { origen: 'manual' as const, precioPactadoAt: new Date() } : {}),
    });

    return (await this.repo.findOne({ where: { id, empresaId } }))!;
  }

  /**
   * Marca el preferente. En una transacción porque el índice único parcial
   * rechaza dos preferentes vivos para el mismo producto: hay que apagar el
   * anterior ANTES de encender el nuevo, o el UPDATE revienta.
   */
  async marcarPreferente(id: number): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    const vinculo = await this.repo.findOne({ where: { id, empresaId } });
    if (!vinculo) throw new NotFoundException(`Vínculo #${id} no encontrado`);

    await this.dataSource.transaction(async (mgr) => {
      await mgr.update(ProductoProveedor,
        { empresaId, productoId: vinculo.productoId, esPreferente: true },
        { esPreferente: false });
      await mgr.update(ProductoProveedor, { id }, { esPreferente: true });
    });
  }

  /** Baja lógica: conserva el histórico y deja que `vincular` lo reactive. */
  async desvincular(id: number): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    const vinculo = await this.repo.findOne({ where: { id, empresaId } });
    if (!vinculo) throw new NotFoundException(`Vínculo #${id} no encontrado`);
    // esPreferente se apaga a la vez: si no, el índice parcial bloquearía marcar
    // un preferente nuevo mientras el desvinculado siguiera con la marca puesta.
    await this.repo.update(id, { isActive: false, esPreferente: false });
  }

  // ── Poblado automático ──────────────────────────────────────────────────────

  /**
   * Crea los vínculos que implica una compra recibida.
   *
   * Este es el mecanismo PERMANENTE de poblado, no el backfill de la migración.
   * Una empresa nueva, sin ningún historial, llega a tener su catálogo por
   * proveedor sin que nadie teclee nada: le basta con operar.
   *
   * No lanza nunca. Una compra se recibe aunque esto falle — es un dato derivado,
   * y bloquear una recepción de mercancía por él sería desproporcionado.
   *
   * `DO NOTHING` también salta las filas DESVINCULADAS (isActive=false), y eso es
   * deliberado: si alguien quitó ese producto del proveedor a mano, una compra
   * nueva no debe deshacer su decisión por la puerta de atrás. Se revincula desde
   * la pantalla, que es donde se ve lo que se está haciendo.
   */
  async registrarDesdeCompra(compraId: number): Promise<void> {
    try {
      await this.dataSource.query(
        `
        INSERT INTO "producto_proveedor" (
          "empresaId", "productoId", "proveedorId",
          "precioPactado", "monedaPactada", "precioPactadoAt", "origen"
        )
        SELECT DISTINCT ON (cd."productoId")
               c."empresaId", cd."productoId", c."proveedorId",
               cd."costoUnitarioReal", COALESCE(c."moneda", 'DOP'), c."fecha", 'compra'
          FROM "compra_detalles" cd
          JOIN "compras" c ON c."id" = cd."compraId"
         WHERE cd."compraId"  = $1
           AND c."empresaId" IS NOT NULL
         ORDER BY cd."productoId", cd."id" DESC
        ON CONFLICT ("empresaId", "productoId", "proveedorId") DO NOTHING
        `,
        [compraId],
      );
    } catch (err) {
      this.logger.warn(
        `No se pudieron registrar los vínculos producto-proveedor de la compra #${compraId}: ${(err as Error).message}`,
      );
    }
  }

  /** Los proveedores de un producto — la inversa, para la ficha de producto. */
  async listarPorProducto(productoId: number): Promise<ProductoProveedor[]> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.repo.find({
      where: { empresaId, productoId, isActive: true },
      relations: ['proveedor'],
      order: { esPreferente: 'DESC' },
    });
  }

  /**
   * Valida que un conjunto de líneas pueda ir en UNA orden de compra.
   *
   * Una `compra` tiene una sola `moneda` y un solo `tipoCambio`, así que mezclar
   * monedas no se puede resolver por detrás sin inventarse una conversión. Se
   * detecta aquí y se obliga a elegir en la pantalla.
   */
  async validarMonedaUnica(vinculoIds: number[]): Promise<string[]> {
    const empresaId = this.tenantService.getEmpresaId();
    if (vinculoIds.length === 0) return [];

    const filas = await this.repo.find({
      where: vinculoIds.map(id => ({ id, empresaId })),
      select: ['id', 'monedaPactada', 'precioPactado'],
    });

    // Solo cuentan las líneas que traen precio: una sin precio no impone moneda.
    const monedas = new Set(
      filas.filter(f => f.precioPactado != null).map(f => f.monedaPactada),
    );
    if (monedas.size > 1) {
      throw new BadRequestException(
        `Las líneas seleccionadas tienen precios en ${monedas.size} monedas distintas ` +
        `(${[...monedas].join(', ')}). Una orden de compra usa una sola moneda: ` +
        `elige una o genera una orden por moneda.`,
      );
    }
    return [...monedas];
  }
}
