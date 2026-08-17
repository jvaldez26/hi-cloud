import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GastoImportacion, EstadoGasto, CriterioProrrateo } from './entities/gasto-importacion.entity';
import { GastoImportacionLinea } from './entities/gasto-importacion-linea.entity';
import { CrearGastoImportacionDto } from './dto/crear-gasto-importacion.dto';
import { AjustarLineasDto } from './dto/ajustar-lineas.dto';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { Compra, CompraEstado } from '../compras/entities/compra.entity';
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

      // Asiento: DR Inventario / CR Gastos Importación por Aplicar
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

  // ── Helpers privados ──────────────────────────────────────────────────────────

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
