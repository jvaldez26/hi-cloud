import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GastoImportacion, EstadoGasto, CriterioProrrateo } from './entities/gasto-importacion.entity';
import { GastoImportacionLinea } from './entities/gasto-importacion-linea.entity';
import { CrearGastoImportacionDto } from './dto/crear-gasto-importacion.dto';
import { AjustarLineasDto } from './dto/ajustar-lineas.dto';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { Compra, CompraEstado } from '../compras/entities/compra.entity';
import { Movimiento, TipoMovimiento } from '../inventario/entities/movimiento.entity';
import { Producto } from '../productos/entities/producto.entity';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TenantService } from '../tenant/tenant.service';

// ── Tipo interno de prorrateo ─────────────────────────────────────────────────

interface ProrrateoCuota {
  montoAsignado: number;
  montoUnitario: number;
}

// ── Tipos de respuesta ─────────────────────────────────────────────────────────

export interface LineaPreview {
  compraDetalleId:   number;
  productoId:        number;
  productoNombre:    string;
  cantidadTotal:     number;
  costoUnitarioBase: number;
  montoAsignado:     number;
  montoUnitario:     number;
  costoUnitarioFinal: number;
  ajusteManual:      boolean;
}

export interface PreviewProrrateo {
  gasto: {
    id:                number;
    concepto:          string;
    tipo:              string;
    montoDOP:          number;
    estado:            string;
    ajusteRetroactivo: boolean;
  };
  lineas:        LineaPreview[];
  totalAsignado: number;
  /** Debe ser 0 si el prorrateo está balanceado */
  diferencia:    number;
}

// ── Tipo interno para la redistribución del remanente ─────────────────────────

interface LineaResuelta {
  compraDetalleId: number;
  productoId:      number;
  cantidadTotal:   number;
  montoAsignado:   number;
  montoUnitario:   number;
  ajusteManual:    boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class GastosImportacionService {
  private readonly logger = new Logger(GastosImportacionService.name);

  constructor(
    @InjectRepository(GastoImportacion)
    private gastoRepo: Repository<GastoImportacion>,
    @InjectRepository(GastoImportacionLinea)
    private lineaRepo: Repository<GastoImportacionLinea>,
    @InjectRepository(CompraDetalle)
    private detalleRepo: Repository<CompraDetalle>,
    @InjectRepository(Compra)
    private compraRepo: Repository<Compra>,
    @InjectDataSource()
    private dataSource: DataSource,
    private asientosService: AsientosAutomaticosService,
    private tenantService:   TenantService,
  ) {}

  private get eid() { return this.tenantService.getEmpresaId(); }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async create(dto: CrearGastoImportacionDto): Promise<GastoImportacion> {
    const empresaId = this.eid;

    const compra = await this.compraRepo.findOne({
      where: { id: dto.compraId, empresaId },
      relations: ['detalles'],
    });
    if (!compra) throw new NotFoundException(`Compra #${dto.compraId} no encontrada`);
    if (compra.estado === CompraEstado.CANCELADA) {
      throw new BadRequestException('No se pueden agregar gastos a una compra cancelada');
    }
    if (compra.detalles.length === 0) {
      throw new BadRequestException('La compra no tiene líneas sobre las cuales prorratear');
    }

    const tc      = Number(dto.tipoCambio ?? 1);
    const montoDOP = Number((Number(dto.monto) * tc).toFixed(2));

    const esRetroactivo = [CompraEstado.RECIBIDA, CompraEstado.PAGADA].includes(compra.estado);

    const gasto = this.gastoRepo.create({
      empresaId,
      compraId:           dto.compraId,
      embarqueId:         null,
      concepto:           dto.concepto,
      tipo:               dto.tipo,
      monto:              dto.monto,
      moneda:             dto.moneda ?? 'DOP',
      tipoCambio:         tc,
      montoDOP,
      criterioProrrateo:  CriterioProrrateo.VALOR_FOB,
      estado:             EstadoGasto.PENDIENTE,
      ajusteRetroactivo:  esRetroactivo,
    });

    const saved = await this.gastoRepo.save(gasto);
    await this._guardarLineas(saved.id, compra.detalles, montoDOP);
    return this.findOne(saved.id);
  }

  async findByCompra(compraId: number): Promise<GastoImportacion[]> {
    return this.gastoRepo.find({
      where:   { compraId, empresaId: this.eid },
      relations: ['lineas'],
      order:   { createdAt: 'ASC' },
    });
  }

  async findOne(id: number): Promise<GastoImportacion> {
    const g = await this.gastoRepo.findOne({
      where:   { id, empresaId: this.eid },
      relations: ['lineas'],
    });
    if (!g) throw new NotFoundException(`Gasto de importación #${id} no encontrado`);
    return g;
  }

  async delete(id: number): Promise<void> {
    const g = await this.findOne(id);
    if (g.estado === EstadoGasto.APLICADO) {
      throw new BadRequestException('No se puede eliminar un gasto ya aplicado. Registra un ajuste manual.');
    }
    await this.gastoRepo.remove(g);
  }

  // ── Vista previa del prorrateo ────────────────────────────────────────────────

  async preview(gastoId: number): Promise<PreviewProrrateo> {
    const gasto = await this.findOne(gastoId);
    const detalles = await this.detalleRepo.find({
      where:     { compraId: gasto.compraId },
      relations: ['producto'],
    });

    const auto     = this._calcularProrrateoFob(Number(gasto.montoDOP), detalles);
    const lineaMap = new Map(gasto.lineas.map(l => [l.compraDetalleId, l]));

    const items: LineaPreview[] = detalles.map(d => {
      const linea  = lineaMap.get(d.id);
      const cuota  = auto.get(d.id)!;
      const isManual = linea?.ajusteManual ?? false;

      const montoAsignado = isManual ? Number(linea!.montoAsignado) : cuota.montoAsignado;
      const cantTotal     = Math.max(Number(d.cantidadTotal), 1);
      const montoUnitario = isManual ? Number(linea!.montoUnitario) : cuota.montoUnitario;
      const costoBase     = Number((d as any).costoUnitarioReal ?? d.precioUnitario);

      return {
        compraDetalleId:    d.id,
        productoId:         d.productoId,
        productoNombre:     (d as any).producto?.nombre ?? `Producto #${d.productoId}`,
        cantidadTotal:      Number(d.cantidadTotal),
        costoUnitarioBase:  costoBase,
        montoAsignado:      Number(montoAsignado.toFixed(4)),
        montoUnitario:      Number(montoUnitario.toFixed(4)),
        costoUnitarioFinal: Number((costoBase + montoUnitario).toFixed(4)),
        ajusteManual:       isManual,
      };
    });

    const totalAsignado = items.reduce((s, i) => s + i.montoAsignado, 0);

    return {
      gasto: {
        id:                gasto.id,
        concepto:          gasto.concepto,
        tipo:              gasto.tipo,
        montoDOP:          Number(gasto.montoDOP),
        estado:            gasto.estado,
        ajusteRetroactivo: gasto.ajusteRetroactivo,
      },
      lineas:        items,
      totalAsignado: Number(totalAsignado.toFixed(4)),
      diferencia:    Number((Number(gasto.montoDOP) - totalAsignado).toFixed(4)),
    };
  }

  // ── Ajuste manual de líneas ────────────────────────────────────────────────────

  async ajustarLineas(gastoId: number, dto: AjustarLineasDto): Promise<PreviewProrrateo> {
    const gasto = await this.findOne(gastoId);
    if (gasto.estado === EstadoGasto.APLICADO) {
      throw new BadRequestException('No se puede ajustar un gasto ya aplicado');
    }

    const montoDOP = Number(gasto.montoDOP);
    const suma     = dto.lineas.reduce((s, l) => s + l.montoAsignado, 0);

    if (Math.abs(suma - montoDOP) > 0.02) {
      throw new BadRequestException(
        `La suma de líneas (${suma.toFixed(2)} DOP) debe igualar el monto del gasto (${montoDOP.toFixed(2)} DOP). Diferencia: ${(suma - montoDOP).toFixed(2)}`,
      );
    }

    // Cargar cantidades para calcular montoUnitario
    const detalles = await this.detalleRepo.find({ where: { compraId: gasto.compraId } });
    const cantMap  = new Map(detalles.map(d => [d.id, Math.max(Number(d.cantidadTotal), 1)]));

    for (const item of dto.lineas) {
      const cant          = cantMap.get(item.compraDetalleId) ?? 1;
      const montoUnitario = Number((item.montoAsignado / cant).toFixed(4));

      await this.lineaRepo.upsert(
        {
          gastoImportacionId: gastoId,
          compraDetalleId:    item.compraDetalleId,
          montoAsignado:      Number(item.montoAsignado.toFixed(4)),
          montoUnitario,
          ajusteManual:       true,
        },
        { conflictPaths: ['gastoImportacionId', 'compraDetalleId'] },
      );
    }

    return this.preview(gastoId);
  }

  // ── Desglose de trazabilidad por compra ───────────────────────────────────────

  async desglosePorCompra(compraId: number): Promise<object[]> {
    const empresaId = this.eid;

    const [detalles, gastos] = await Promise.all([
      this.detalleRepo.find({ where: { compraId }, relations: ['producto'] }),
      this.gastoRepo.find({
        where:   { compraId, empresaId },
        relations: ['lineas'],
        order:   { aplicadoAt: 'ASC' },
      }),
    ]);

    return detalles.map(d => {
      const gastosDetalle = gastos.flatMap(g =>
        g.lineas
          .filter(l => l.compraDetalleId === d.id)
          .map(l => ({
            gastoId:        g.id,
            concepto:       g.concepto,
            tipo:           g.tipo,
            estado:         g.estado,
            montoAsignado:  Number(l.montoAsignado),
            montoUnitario:  Number(l.montoUnitario),
          })),
      );

      const costoBase       = Number((d as any).costoUnitarioReal ?? d.precioUnitario);
      const costoImportacion = Number((d as any).costoImportacionUnitario ?? 0);

      return {
        compraDetalleId:         d.id,
        productoId:              d.productoId,
        productoNombre:          (d as any).producto?.nombre ?? `Producto #${d.productoId}`,
        cantidadTotal:           Number(d.cantidadTotal),
        costoUnitarioBase:       costoBase,
        gastos:                  gastosDetalle,
        costoImportacionUnitario: costoImportacion,
        costoUnitarioFinal:      Number((costoBase + costoImportacion).toFixed(4)),
      };
    });
  }

  // ── API interna para compras.service.ts (Caso A) ──────────────────────────────

  /**
   * Lee los gastos pendientes (no retroactivos) de una compra y devuelve el
   * costo de importación por unidad para cada línea.
   * SIN EFECTOS SECUNDARIOS — solo lectura.
   * Llamado desde compras.service.ts antes del bucle de AVCO.
   */
  async getCostosImportacionPorUnidad(
    compraId: number,
    detalles: CompraDetalle[],
    empresaId: number,
  ): Promise<Map<number, number>> {
    const gastos = await this.gastoRepo.find({
      where:   { compraId, empresaId, estado: EstadoGasto.PENDIENTE, ajusteRetroactivo: false },
      relations: ['lineas'],
    });

    const costMap = new Map<number, number>();
    for (const gasto of gastos) {
      const auto = this._calcularProrrateoFob(Number(gasto.montoDOP), detalles);
      for (const d of detalles) {
        const linea = gasto.lineas.find(l => l.compraDetalleId === d.id);
        const mu    = linea?.ajusteManual
          ? Number(linea.montoUnitario)
          : (auto.get(d.id)?.montoUnitario ?? 0);
        costMap.set(d.id, (costMap.get(d.id) ?? 0) + mu);
      }
    }
    return costMap;
  }

  /**
   * Aplica todos los gastos pendientes (no retroactivos) de una compra:
   *  1. Persiste las líneas de distribución
   *  2. Incrementa costoImportacionUnitario en cada compra_detalle
   *  3. Marca los gastos como APLICADO
   *  4. Genera asiento contable: DR Inventario / CR Gastos Importación por Aplicar
   *
   * Llamado desde compras.service.ts cuando la compra llega a RECIBIDA.
   */
  async aplicarGastosPendientes(
    compraId: number,
    detalles: CompraDetalle[],
    empresaId: number,
    usuarioId: number,
    compraFolio: string,
  ): Promise<void> {
    const gastos = await this.gastoRepo.find({
      where:   { compraId, empresaId, estado: EstadoGasto.PENDIENTE, ajusteRetroactivo: false },
      relations: ['lineas'],
    });

    for (const gasto of gastos) {
      const montoDOP = Number(gasto.montoDOP);
      const auto     = this._calcularProrrateoFob(montoDOP, detalles);

      for (const d of detalles) {
        const linea = gasto.lineas.find(l => l.compraDetalleId === d.id);
        const cuota = auto.get(d.id)!;

        const montoAsignado = linea?.ajusteManual ? Number(linea.montoAsignado) : cuota.montoAsignado;
        const montoUnitario = linea?.ajusteManual ? Number(linea.montoUnitario) : cuota.montoUnitario;

        // Persiste / actualiza la línea de distribución
        await this.lineaRepo.upsert(
          { gastoImportacionId: gasto.id, compraDetalleId: d.id, montoAsignado, montoUnitario, ajusteManual: linea?.ajusteManual ?? false },
          { conflictPaths: ['gastoImportacionId', 'compraDetalleId'] },
        );

        // Acumula en el campo del detalle (usado para trazabilidad y próxima llamada)
        await this.detalleRepo.increment({ id: d.id }, 'costoImportacionUnitario' as any, montoUnitario);
      }

      // Marca el gasto como aplicado
      await this.gastoRepo.update(gasto.id, {
        estado:     EstadoGasto.APLICADO,
        aplicadoAt: new Date(),
      });

      // Asiento: DR Inventario / CR Gastos Importación por Aplicar (Caso A: best-effort)
      await this.asientosService.asientoGastoImportacion({
        gastoId:      gasto.id,
        concepto:     gasto.concepto,
        montoDOP,
        compraFolio,
        usuarioId,
      });

      this.logger.log(`Gasto importación #${gasto.id} (${gasto.concepto}) aplicado — ${montoDOP} DOP en compra ${compraFolio}`);
    }
  }

  // ── Caso B: ajuste retroactivo de AVCO ───────────────────────────────────────

  /**
   * Ajusta el costoPromedio AVCO de cada producto con el costo de importación real.
   *
   * Fórmula invariante AVCO retroactiva:
   *   stockActual × costoNuevo = stockActual × costoActual + montoAsignado
   *   ∴ costoNuevo = costoActual + montoAsignado / stockActual
   *
   * Verificación numérica:
   *   stock=100, costoActual=50, cantidadTotal=20, montoUnitario=5
   *   → montoAsignado = 20 × 5 = 100 DOP
   *   → costoNuevo = 50 + 100/100 = 51.00 ✓  (NO 55.00 = costoActual + montoUnitario)
   *
   * PRIMERA PASADA — simulación sin escrituras:
   *   Detecta condiciones que requieren confirmación explícita:
   *     · costoActual = 0 (el salto puede ser desproporcionado)
   *     · stock = 0 (sin denominador válido para AVCO)
   *     · |delta| > umbral configurable por empresa
   *
   * SEGUNDA PASADA — aplicación atómica en una sola transacción:
   *   FOR UPDATE en cada producto  → sin race conditions concurrentes.
   *   Movimiento cantidad=0        → trazabilidad sin impacto físico.
   *   Asiento DENTRO de la tx      → inventario ≡ mayor contable siempre.
   *   Si el asiento falla          → rollback de todo (nunca AVCO ajustado sin asiento).
   */
  async aplicarGastoRetroactivo(
    gastoId:   number,
    dto:       { confirmado?: boolean },
    usuarioId: number,
  ): Promise<{
    aplicado:             boolean;
    necesitaConfirmacion: boolean;
    advertencias:         string[];
    lineas: Array<{ productoId: number; costoAnterior: number; costoNuevo: number; delta: number }>;
  }> {
    const empresaId = this.eid;
    const gasto     = await this.findOne(gastoId);

    if (!gasto.ajusteRetroactivo) {
      throw new BadRequestException(
        'Este gasto no está marcado como retroactivo. Use el flujo normal de recepción.',
      );
    }
    if (gasto.estado === EstadoGasto.APLICADO) {
      throw new BadRequestException('Este gasto ya fue aplicado.');
    }

    // Umbral de alerta configurable por empresa (default 5,000 DOP/u).
    // Para personalizar: actualizar empresa.configuracion.umbralAlertaCostoImportacion.
    const [empresaRow] = await this.dataSource.query<{ configuracion: Record<string, unknown> | null }[]>(
      `SELECT configuracion FROM empresa WHERE id = $1 LIMIT 1`,
      [empresaId],
    );
    const umbral = Number(empresaRow?.configuracion?.umbralAlertaCostoImportacion ?? 5_000);

    // Distribución final respetando ajustes manuales (con remanente redistribuido)
    const lineas = await this._resolverProrrateoConManuales(gasto);

    // Guardia de balance: la suma debe igualar el monto del gasto (tolerancia 0.02 DOP)
    const totalAsignado = lineas.reduce((s, l) => s + l.montoAsignado, 0);
    const diferencia    = Math.abs(totalAsignado - Number(gasto.montoDOP));
    if (diferencia > 0.02) {
      throw new BadRequestException(
        `El prorrateo no está balanceado: diferencia de ${diferencia.toFixed(4)} DOP. ` +
        `Ajusta las líneas antes de aplicar.`,
      );
    }

    // ─── PRIMERA PASADA: simulación sin writes ────────────────────────────────
    let necesitaConfirmacion = false;
    const advertencias: string[] = [];
    const lineaResults: Array<{
      productoId:    number;
      costoAnterior: number;
      costoNuevo:    number;
      delta:         number;
    }> = [];

    for (const linea of lineas) {
      const [prod] = await this.dataSource.query<{ costoPromedio: string; stock: string }[]>(
        `SELECT "costoPromedio", stock FROM productos WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [linea.productoId, empresaId],
      );
      if (!prod) continue;

      const costoActual = Number(prod.costoPromedio);
      const stockActual = Number(prod.stock);

      if (stockActual === 0) {
        // Sin denominador válido — el AVCO no puede actualizarse; el costo se registra igualmente.
        necesitaConfirmacion = true;
        advertencias.push(
          `Producto #${linea.productoId}: stock actual 0. ` +
          `El costo de importación se registrará pero el AVCO no cambiará.`,
        );
        lineaResults.push({
          productoId: linea.productoId, costoAnterior: costoActual, costoNuevo: costoActual, delta: 0,
        });
        continue;
      }

      // costoNuevo = costoActual + montoAsignado / stockActual
      const costoNuevo = Number((costoActual + linea.montoAsignado / stockActual).toFixed(4));
      const delta      = Number((costoNuevo - costoActual).toFixed(4));

      // costoActual = 0 → el salto puede ser arbitrariamente grande; pedir confirmación
      if (costoActual === 0) {
        necesitaConfirmacion = true;
        advertencias.push(
          `Producto #${linea.productoId}: costo promedio actual es 0. ` +
          `El nuevo costo sería ${costoNuevo.toFixed(4)} DOP/u. Confirme si es correcto.`,
        );
      }

      // Salto mayor al umbral configurable por empresa
      if (Math.abs(delta) > umbral) {
        necesitaConfirmacion = true;
        advertencias.push(
          `Producto #${linea.productoId}: ajuste de ${delta.toFixed(4)} DOP/u supera el umbral ` +
          `de ${umbral.toFixed(0)} DOP/u (empresa.configuracion.umbralAlertaCostoImportacion).`,
        );
      }

      lineaResults.push({ productoId: linea.productoId, costoAnterior: costoActual, costoNuevo, delta });
    }

    // Sin confirmación cuando se requiere → devolver preview con advertencias
    if (necesitaConfirmacion && !dto.confirmado) {
      return { aplicado: false, necesitaConfirmacion: true, advertencias, lineas: lineaResults };
    }

    // ─── SEGUNDA PASADA: aplicación atómica ───────────────────────────────────
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const resultadosFinales: typeof lineaResults = [];

      for (const linea of lineas) {
        // FOR UPDATE: bloqueo pesimista — ningún otro proceso toca este producto
        const prod = await qr.manager
          .createQueryBuilder(Producto, 'p')
          .where('p.id = :id AND p."empresaId" = :eid', { id: linea.productoId, eid: empresaId })
          .setLock('pessimistic_write')
          .getOne();

        if (!prod) continue;

        const costoActual = Number(prod.costoPromedio);
        const stockActual = Number(prod.stock);

        // Incremento parametrizado de costoImportacionUnitario en el detalle de compra.
        // Siempre se registra: el costo fue incurrido aunque el stock sea 0.
        await qr.manager.query(
          `UPDATE "compra_detalles"
              SET "costoImportacionUnitario" = "costoImportacionUnitario" + $1
            WHERE id = $2`,
          [linea.montoUnitario, linea.compraDetalleId],
        );

        if (stockActual === 0) {
          // Costo registrado, pero AVCO no cambia (sin denominador válido)
          resultadosFinales.push({
            productoId: linea.productoId, costoAnterior: costoActual, costoNuevo: costoActual, delta: 0,
          });
          continue;
        }

        // Fórmula AVCO: costoNuevo = costoActual + montoAsignado / stockActual
        const costoNuevo = Number((costoActual + linea.montoAsignado / stockActual).toFixed(4));

        // Actualizar costoPromedio del producto
        await qr.manager.update(Producto, prod.id, { costoPromedio: costoNuevo });

        // Movimiento de trazabilidad con cantidad=0 (ajuste puro de costo, sin impacto físico).
        // En reportes que hacen GROUP BY tipo o SUM(cantidad): aparece como una fila más con
        // totalUnidades=0, que no altera ningún total de stock ni de kardex valorado.
        await qr.manager.save(Movimiento, {
          empresaId,
          productoId:       linea.productoId,
          tipo:             TipoMovimiento.AJUSTE_COSTO_IMPORTACION,
          cantidad:         0,
          cantidadAnterior: stockActual,
          cantidadNueva:    stockActual,
          motivo:           `Gasto importación #${gastoId}: ${gasto.concepto} — ajuste AVCO retroactivo`,
          referencia:       `GIMP-${gastoId}`,
          userId:           usuarioId,
        });

        resultadosFinales.push({
          productoId:    linea.productoId,
          costoAnterior: costoActual,
          costoNuevo,
          delta:         Number((costoNuevo - costoActual).toFixed(4)),
        });
      }

      // Persistir líneas de distribución definitivas (dentro de la tx)
      for (const linea of lineas) {
        await qr.manager.upsert(
          GastoImportacionLinea,
          {
            gastoImportacionId: gastoId,
            compraDetalleId:    linea.compraDetalleId,
            montoAsignado:      linea.montoAsignado,
            montoUnitario:      linea.montoUnitario,
            ajusteManual:       linea.ajusteManual,
          },
          { conflictPaths: ['gastoImportacionId', 'compraDetalleId'] },
        );
      }

      // Marcar gasto como APLICADO (dentro de la tx)
      await qr.manager.update(GastoImportacion, gastoId, {
        estado:     EstadoGasto.APLICADO,
        aplicadoAt: new Date(),
      });

      // Asiento contable DENTRO de la misma transacción.
      // Si falla → rollback completo: inventario y mayor contable siempre en sintonía.
      await this.asientosService.asientoGastoImportacion(
        {
          gastoId,
          concepto:    gasto.concepto,
          montoDOP:    Number(gasto.montoDOP),
          compraFolio: `retro-${gasto.compraId}`,
          usuarioId,
        },
        qr.manager,
      );

      await qr.commitTransaction();

      this.logger.log(
        `Gasto importación #${gastoId} aplicado retroactivamente — ` +
        `${resultadosFinales.length} producto(s) ajustado(s).`,
      );

      return { aplicado: true, necesitaConfirmacion, advertencias, lineas: resultadosFinales };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(`aplicarGastoRetroactivo #${gastoId}: ${(err as Error).message}`);
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────────

  /**
   * Resuelve la distribución final del gasto respetando los ajustes manuales.
   *
   * Lógica:
   *   1. sumManual  = suma de montoAsignado de las líneas marcadas como ajusteManual
   *   2. Validar que sumManual ≤ montoDOP (si no, los manuales superan el total)
   *   3. remanente  = montoDOP − sumManual
   *   4. auto       = _calcularProrrateoFob(remanente, detalles SIN ajuste manual)
   *   5. montoUnitario SIEMPRE derivado de montoAsignado / cantidadTotal
   *      (el valor guardado puede estar desfasado si el usuario editó el monto luego)
   *
   * Prueba: gasto 1,000 DOP · línea A manual 700 · línea B auto
   *   sumManual=700  →  remanente=300  →  B recibe 300  →  suma=1,000 ✓
   */
  private async _resolverProrrateoConManuales(gasto: GastoImportacion): Promise<LineaResuelta[]> {
    const detalles  = await this.detalleRepo.find({ where: { compraId: gasto.compraId } });
    const lineaMap  = new Map(gasto.lineas.map(l => [l.compraDetalleId, l]));
    const montoDOP  = Number(gasto.montoDOP);

    // Separar manuales de automáticos
    const manuales    = detalles.filter(d =>  lineaMap.get(d.id)?.ajusteManual);
    const automaticos = detalles.filter(d => !lineaMap.get(d.id)?.ajusteManual);

    // Suma de montos manuales
    const sumManual = manuales.reduce(
      (s, d) => s + Number(lineaMap.get(d.id)!.montoAsignado),
      0,
    );

    // Validar que los manuales no superen el total del gasto
    if (sumManual > montoDOP + 0.02) {
      throw new BadRequestException(
        `Las líneas con ajuste manual suman ${sumManual.toFixed(2)} DOP, ` +
        `que supera el monto del gasto (${montoDOP.toFixed(2)} DOP). ` +
        `Reduce algún ajuste manual antes de aplicar.`,
      );
    }

    // Remanente para los automáticos (la última línea absorbe el residuo de redondeo)
    const remanente = Number((montoDOP - sumManual).toFixed(4));
    const auto      = this._calcularProrrateoFob(remanente, automaticos);

    return detalles.map(d => {
      const linea    = lineaMap.get(d.id);
      const isManual = linea?.ajusteManual ?? false;
      const cant     = Math.max(Number(d.cantidadTotal), 1);

      let montoAsignado: number;

      if (isManual) {
        montoAsignado = Number(linea!.montoAsignado);
      } else {
        // Guard: _calcularProrrateoFob puede no tener entrada si automaticos está vacío
        const cuota   = auto.get(d.id);
        montoAsignado = cuota ? cuota.montoAsignado : 0;
      }

      // montoUnitario siempre derivado de montoAsignado / cantidadTotal.
      // El valor guardado en la fila puede estar desfasado si el usuario modificó
      // el monto manual después de que el unitario ya había sido calculado.
      const montoUnitario = Number((montoAsignado / cant).toFixed(4));

      return {
        compraDetalleId: d.id,
        productoId:      d.productoId,
        cantidadTotal:   cant,
        montoAsignado:   Number(montoAsignado.toFixed(4)),
        montoUnitario,
        ajusteManual:    isManual,
      };
    });
  }

  /**
   * Prorrateo por valor FOB (subtotal de cada línea respecto al total de la compra).
   * La última línea absorbe el residuo de redondeo para que la suma sea exacta.
   */
  private _calcularProrrateoFob(
    montoDOP: number,
    detalles: CompraDetalle[],
  ): Map<number, ProrrateoCuota> {
    const result = new Map<number, ProrrateoCuota>();
    if (detalles.length === 0) return result;

    const totalFOB = detalles.reduce((s, d) => s + Number(d.subtotal), 0);

    if (totalFOB === 0) {
      // Distribución igualitaria cuando todos los subtotales son 0 (bonificaciones puras)
      const mpp = Number((montoDOP / detalles.length).toFixed(4));
      for (const d of detalles) {
        const cant = Math.max(Number(d.cantidadTotal), 1);
        result.set(d.id, { montoAsignado: mpp, montoUnitario: Number((mpp / cant).toFixed(4)) });
      }
      return result;
    }

    let asignado = 0;
    for (let i = 0; i < detalles.length; i++) {
      const d      = detalles[i];
      const isLast = i === detalles.length - 1;
      const cant   = Math.max(Number(d.cantidadTotal), 1);

      const montoAsignado = isLast
        ? Number((montoDOP - asignado).toFixed(4))
        : Number((montoDOP * Number(d.subtotal) / totalFOB).toFixed(4));

      asignado += montoAsignado;
      result.set(d.id, {
        montoAsignado,
        montoUnitario: Number((montoAsignado / cant).toFixed(4)),
      });
    }

    return result;
  }

  private async _guardarLineas(
    gastoId: number,
    detalles: CompraDetalle[],
    montoDOP: number,
  ): Promise<void> {
    await this.lineaRepo.delete({ gastoImportacionId: gastoId });

    const prorateo = this._calcularProrrateoFob(montoDOP, detalles);
    const lineas   = detalles.map(d => {
      const cuota = prorateo.get(d.id)!;
      return this.lineaRepo.create({
        gastoImportacionId: gastoId,
        compraDetalleId:    d.id,
        montoAsignado:      cuota.montoAsignado,
        montoUnitario:      cuota.montoUnitario,
        ajusteManual:       false,
      });
    });

    await this.lineaRepo.save(lineas);
  }
}
