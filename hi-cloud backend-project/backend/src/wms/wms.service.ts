import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UbicacionAlmacen, TipoUbicacion } from './entities/ubicacion-almacen.entity';
import { OrdenPicking, EstadoPicking, TipoOrdenPicking } from './entities/orden-picking.entity';
import { OrdenPickingLinea, EstadoLineaPicking } from './entities/orden-picking-linea.entity';
import { TenantService } from '../tenant/tenant.service';
import { InventarioService } from '../inventario/inventario.service';

@Injectable()
export class WmsService {
  private readonly logger = new Logger(WmsService.name);

  constructor(
    @InjectRepository(UbicacionAlmacen)
    private ubicRepo: Repository<UbicacionAlmacen>,
    @InjectRepository(OrdenPicking)
    private ordenRepo: Repository<OrdenPicking>,
    @InjectRepository(OrdenPickingLinea)
    private lineaRepo: Repository<OrdenPickingLinea>,
    private tenantService: TenantService,
    private inventarioSvc: InventarioService,
    private ds: DataSource,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Numeración
  // ─────────────────────────────────────────────────────────────────────────
  private async nextNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const res = await this.ordenRepo
      .createQueryBuilder('o')
      .select(`MAX(CASE WHEN o.numero ~ '^OP-[0-9]+$' THEN CAST(SUBSTRING(o.numero FROM 4) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('o.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `OP-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ubicaciones
  // ─────────────────────────────────────────────────────────────────────────

  async crearUbicacion(dto: {
    almacenId: number; codigo: string; tipo?: TipoUbicacion;
    pasillo?: string; estante?: string; nivel?: string; posicion?: string;
    capacidadKg?: number; notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.ubicRepo.findOne({
      where: { almacenId: dto.almacenId, codigo: dto.codigo, empresaId, isActive: true },
    });
    if (existe) throw new ConflictException(`Ubicación "${dto.codigo}" ya existe en este almacén`);

    const u = this.ubicRepo.create({ ...dto, empresaId, activa: true });
    return this.ubicRepo.save(u);
  }

  async getUbicaciones(almacenId?: number, tipo?: TipoUbicacion) {
    const empresaId = this.tenantService.getEmpresaId();
    const params: (string | number)[] = [empresaId];
    let where = `u."empresaId"=$1 AND u."isActive"=true AND u.activa=true`;

    if (almacenId) {
      params.push(almacenId);
      where += ` AND u."almacenId"=$${params.length}`;
    }
    if (tipo) {
      params.push(tipo);
      where += ` AND u.tipo=$${params.length}`;
    }

    const rows = await this.ds.query<any[]>(
      `SELECT u.*,
              a.nombre          AS "_almacenNombre",
              a.codigo          AS "_almacenCodigo",
              a.id              AS "_almacenId",
              COALESCE(
                (SELECT SUM(l."cantidadSolicitada")
                 FROM wms_lineas_picking l
                 JOIN wms_ordenes_picking o ON o.id = l."ordenId"
                 WHERE l."ubicacionId" = u.id
                   AND l."isActive" = true
                   AND o."isActive" = true
                   AND o.estado NOT IN ('cancelada','despachada')
                ), 0)::numeric  AS "unidadesPendientes"
       FROM wms_ubicaciones u
       LEFT JOIN almacenes a ON a.id = u."almacenId"
       WHERE ${where}
       ORDER BY u.pasillo ASC NULLS LAST, u.estante ASC NULLS LAST, u.nivel ASC NULLS LAST`,
      params,
    );

    return rows.map(r => ({
      ...r,
      almacen: { id: r._almacenId, nombre: r._almacenNombre, codigo: r._almacenCodigo },
    }));
  }

  async updateUbicacion(id: number, dto: Partial<UbicacionAlmacen>) {
    const empresaId = this.tenantService.getEmpresaId();
    const u = await this.ubicRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!u) throw new NotFoundException(`Ubicación #${id} no encontrada`);

    const { almacenId: _a, empresaId: _e, isActive: _i, ...safe } = dto as any;
    await this.ubicRepo.update(id, safe);
    const updated = await this.ubicRepo.findOne({ where: { id } });
    return updated;
  }

  async deleteUbicacion(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.ubicRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Ubicación eliminada' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Órdenes de Picking
  // ─────────────────────────────────────────────────────────────────────────

  async crearOrden(dto: {
    almacenId: number;
    tipo?: TipoOrdenPicking;
    facturaId?: number;
    transferId?: number;
    prioridad?: number;
    destinatario?: string;
    direccionEntrega?: string;
    observaciones?: string;
    creadoPorId: number;
    lineas: Array<{
      productoId: number;
      cantidadSolicitada: number;
      ubicacionId?: number;
      loteId?: number;
      numeroSerie?: string;
    }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();

    // ── Validar stock disponible por producto en el almacén ──────────────────
    for (const linea of dto.lineas) {
      const stockRows = await this.ds.query<any[]>(
        `SELECT stock FROM stock_almacen
         WHERE "almacenId"=$1 AND "productoId"=$2 AND "isActive"=true LIMIT 1`,
        [dto.almacenId, linea.productoId],
      );
      const disponible = Number(stockRows[0]?.stock ?? 0);
      if (disponible < linea.cantidadSolicitada) {
        const [prod] = await this.ds.query<any[]>(
          `SELECT nombre, codigo FROM productos WHERE id=$1 LIMIT 1`,
          [linea.productoId],
        );
        const nombre = prod ? `${prod.codigo} — ${prod.nombre}` : `Producto #${linea.productoId}`;
        throw new BadRequestException(
          `Stock insuficiente para "${nombre}": disponible ${disponible}, solicitado ${linea.cantidadSolicitada}`,
        );
      }
    }

    const numero = await this.nextNumero();

    const orden = await this.ordenRepo.save(
      this.ordenRepo.create({
        numero,
        tipo:             dto.tipo ?? TipoOrdenPicking.SALIDA_VENTA,
        almacenId:        dto.almacenId,
        facturaId:        dto.facturaId,
        transferId:       dto.transferId,
        prioridad:        dto.prioridad ?? 2,
        destinatario:     dto.destinatario,
        direccionEntrega: dto.direccionEntrega,
        observaciones:    dto.observaciones,
        creadoPorId:      dto.creadoPorId,
        estado:           EstadoPicking.BORRADOR,
        empresaId,
      }),
    );

    // Crear líneas — si la línea tiene ubicacionId, buscar el código
    const lineas = await Promise.all(dto.lineas.map(async (l, idx) => {
      let ubicacionCodigo: string | undefined;
      if (l.ubicacionId) {
        const ubic = await this.ubicRepo.findOne({ where: { id: l.ubicacionId } });
        ubicacionCodigo = ubic?.codigo;
      } else {
        // Preferir la ubicación por defecto del producto en este almacén (stock_almacen.ubicacionId)
        const [stockRow] = await this.ds.query<any[]>(
          `SELECT sa."ubicacionId", u.codigo
           FROM stock_almacen sa
           LEFT JOIN wms_ubicaciones u ON u.id = sa."ubicacionId"
           WHERE sa."productoId" = $1 AND sa."almacenId" = $2 AND sa."empresaId" = $3
             AND sa."isActive" = true AND u."isActive" IS NOT FALSE
           LIMIT 1`,
          [l.productoId, dto.almacenId, empresaId],
        );
        if (stockRow?.ubicacionId) {
          l = { ...l, ubicacionId: stockRow.ubicacionId };
          ubicacionCodigo = stockRow.codigo;
        } else {
          // Fallback: primera ubicación de tipo picking en el almacén
          const rows = await this.ds.query<any[]>(
            `SELECT id, codigo FROM wms_ubicaciones
             WHERE "almacenId"=$1 AND "empresaId"=$2 AND tipo='picking'
               AND "isActive"=true AND activa=true
             ORDER BY id ASC LIMIT 1`,
            [dto.almacenId, empresaId],
          );
          if (rows[0]) {
            l = { ...l, ubicacionId: rows[0].id };
            ubicacionCodigo = rows[0].codigo;
          }
        }
      }
      return this.lineaRepo.create({
        ordenId:            orden.id,
        productoId:         l.productoId,
        ubicacionId:        l.ubicacionId,
        ubicacionCodigo,
        cantidadSolicitada: l.cantidadSolicitada,
        cantidadPickeada:   0,
        loteId:             l.loteId,
        numeroSerie:        l.numeroSerie,
        estado:             EstadoLineaPicking.PENDIENTE,
        orden_linea:        idx + 1,
        empresaId,
      });
    }));

    await this.lineaRepo.save(lineas);
    return this.findOrdenById(orden.id);
  }

  async getOrdenes(filtro: { estado?: EstadoPicking; almacenId?: number; operadorId?: number; page?: number; limit?: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { estado, almacenId, operadorId, page = 1, limit = 20 } = filtro;

    const qb = this.ordenRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.almacen',  'alm')
      .leftJoinAndSelect('o.operador', 'op')
      .leftJoinAndSelect('o.lineas',   'l')
      .where('o.empresaId = :eid', { eid: empresaId })
      .andWhere('o.isActive = true');

    if (estado)     qb.andWhere('o.estado = :estado', { estado });
    if (almacenId)  qb.andWhere('o.almacenId = :aid', { aid: almacenId });
    if (operadorId) qb.andWhere('o.operadorId = :oid', { oid: operadorId });

    const [data, total] = await qb
      .orderBy('o.prioridad', 'ASC')
      .addOrderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOrdenById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const o = await this.ordenRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['almacen', 'operador', 'lineas', 'lineas.producto'],
    });
    if (!o) throw new NotFoundException(`Orden de picking #${id} no encontrada`);
    return o;
  }

  // ─── Flujo: Asignar → Iniciar → Pickear líneas → Empacar → Despachar ──────

  async asignarOperador(id: number, operadorId: number) {
    const o = await this.findOrdenById(id);
    if (o.estado !== EstadoPicking.BORRADOR) {
      throw new BadRequestException('Solo se pueden asignar órdenes en estado borrador');
    }
    await this.ordenRepo.update(id, {
      operadorId,
      estado:          EstadoPicking.ASIGNADA,
      fechaAsignacion: new Date(),
    } as any);
    return this.findOrdenById(id);
  }

  async iniciarPicking(id: number) {
    const o = await this.findOrdenById(id);
    if (o.estado !== EstadoPicking.ASIGNADA) {
      throw new BadRequestException('La orden debe estar asignada para iniciar picking');
    }
    await this.ordenRepo.update(id, { estado: EstadoPicking.EN_PROCESO, fechaInicio: new Date() } as any);
    return this.findOrdenById(id);
  }

  async pickearLinea(lineaId: number, dto: {
    cantidadPickeada: number;
    notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const linea = await this.lineaRepo.findOne({ where: { id: lineaId, empresaId, isActive: true } });
    if (!linea) throw new NotFoundException(`Línea #${lineaId} no encontrada`);

    const { cantidadPickeada } = dto;
    let estado: EstadoLineaPicking;

    if (cantidadPickeada >= Number(linea.cantidadSolicitada)) {
      estado = EstadoLineaPicking.PICKEADO;
    } else if (cantidadPickeada > 0) {
      estado = EstadoLineaPicking.PARCIAL;
    } else {
      estado = EstadoLineaPicking.FALTANTE;
    }

    await this.lineaRepo.update(lineaId, { cantidadPickeada, estado, notas: dto.notas } as any);

    // Verificar si todas las líneas están procesadas → pasar a empacado automático
    const orden = await this.findOrdenById(linea.ordenId);
    const todasProcesadas = orden.lineas.every(
      l => l.id === lineaId
        ? true
        : [EstadoLineaPicking.PICKEADO, EstadoLineaPicking.FALTANTE, EstadoLineaPicking.PARCIAL].includes(l.estado),
    );

    if (todasProcesadas && orden.estado === EstadoPicking.EN_PROCESO) {
      await this.ordenRepo.update(linea.ordenId, { estado: EstadoPicking.EMPACADA, fechaEmpacado: new Date() } as any);
    }

    return this.findOrdenById(linea.ordenId);
  }

  async despacharOrden(id: number, dto: { observaciones?: string; operadorId?: number }) {
    const o = await this.findOrdenById(id);
    if (o.estado !== EstadoPicking.EMPACADA) {
      throw new BadRequestException('La orden debe estar empacada para despachar');
    }

    await this.ordenRepo.update(id, {
      estado:          EstadoPicking.DESPACHADA,
      fechaDespachado: new Date(),
      observaciones:   dto.observaciones ?? o.observaciones,
    } as any);

    // Descontar inventario por cada línea pickeada — no bloquear si falla
    const operadorId = dto.operadorId ?? o.creadoPorId ?? 0;
    for (const linea of o.lineas) {
      const pickeada = Number(linea.cantidadPickeada ?? 0);
      if (!linea.productoId || pickeada <= 0) continue;
      await this.inventarioSvc
        .registrarSalida(
          linea.productoId,
          pickeada,
          operadorId,
          `Picking despachado OP ${o.numero}`,
          o.numero,
        )
        .catch((err: unknown) => {
          this.logger.warn(
            `[WMS] registrarSalida OP ${o.numero} prod #${linea.productoId} ` +
            `(${pickeada} uds) falló: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    // Si tiene facturaId, actualizar estado entrega (fire-and-forget)
    if (o.facturaId) {
      this.ds.query(
        `UPDATE facturas SET "estadoEntrega"='entregada', "fechaEntrega"=NOW()
         WHERE id=$1 AND "estadoEntrega" != 'entregada'`,
        [o.facturaId],
      ).catch((err: unknown) => {
        this.logger.warn(`[WMS] No se pudo actualizar entrega factura #${o.facturaId}: ${err}`);
      });
    }

    return this.findOrdenById(id);
  }

  async cancelarOrden(id: number) {
    const o = await this.findOrdenById(id);
    if ([EstadoPicking.DESPACHADA].includes(o.estado)) {
      throw new BadRequestException('No se puede cancelar una orden ya despachada');
    }
    await this.ordenRepo.update(id, { estado: EstadoPicking.CANCELADA } as any);
    return this.findOrdenById(id);
  }

  // ─── Ruta de recogida optimizada (por ubicación) ────────────────────────

  async generarRutaRecogida(id: number) {
    const orden = await this.findOrdenById(id);

    const lineasOrdenadas = [...orden.lineas].sort((a, b) =>
      (a.ubicacionCodigo ?? 'zzz').localeCompare(b.ubicacionCodigo ?? 'zzz'),
    );

    await Promise.all(lineasOrdenadas.map((l, idx) =>
      this.lineaRepo.update(l.id, { orden_linea: idx + 1 } as any),
    ));

    return { ...orden, lineas: lineasOrdenadas };
  }

  // ─── Dashboard WMS ──────────────────────────────────────────────────────

  async getDashboard() {
    const empresaId = this.tenantService.getEmpresaId();

    const [borrador, asignadas, enProceso, empacadas, despachadas] = await Promise.all([
      this.ordenRepo.count({ where: { empresaId, estado: EstadoPicking.BORRADOR,   isActive: true } }),
      this.ordenRepo.count({ where: { empresaId, estado: EstadoPicking.ASIGNADA,   isActive: true } }),
      this.ordenRepo.count({ where: { empresaId, estado: EstadoPicking.EN_PROCESO, isActive: true } }),
      this.ordenRepo.count({ where: { empresaId, estado: EstadoPicking.EMPACADA,   isActive: true } }),
      this.ordenRepo.count({ where: { empresaId, estado: EstadoPicking.DESPACHADA, isActive: true } }),
    ]);

    // Cola por operador
    const colaOperadores = await this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.operador', 'u')
      .select(['o.operadorId AS "operadorId"', 'u.nombre AS "nombre"', 'COUNT(o.id) AS "ordenes"'])
      .where('o.empresaId = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o.estado IN (:...estados)', { estados: [EstadoPicking.ASIGNADA, EstadoPicking.EN_PROCESO] })
      .andWhere('o."operadorId" IS NOT NULL')
      .groupBy('o."operadorId", u.nombre')
      .orderBy('"ordenes"', 'DESC')
      .getRawMany();

    // Urgentes pendientes (no despachadas ni canceladas)
    const urgentes = await this.ordenRepo.count({
      where: { empresaId, prioridad: 1, isActive: true } as any,
    });

    // ── Estadísticas de ubicaciones ───────────────────────────────────────
    const [ubiStats] = await this.ds.query<any[]>(
      `SELECT COUNT(*)::int                                    AS total,
              COUNT(*) FILTER(WHERE activa=true)::int          AS activas,
              COALESCE(SUM(
                (SELECT COUNT(*) FROM wms_lineas_picking l
                 JOIN wms_ordenes_picking o ON o.id = l."ordenId"
                 WHERE l."ubicacionId" = u.id
                   AND l."isActive"=true AND o."isActive"=true
                   AND o.estado NOT IN ('cancelada','despachada'))
              ),0)::int AS "enUso"
       FROM wms_ubicaciones u
       WHERE u."empresaId"=$1 AND u."isActive"=true`,
      [empresaId],
    );

    // ── Stock bajo por almacén (top 10) ───────────────────────────────────
    const stockBajo = await this.ds.query<any[]>(
      `SELECT p.nombre, p.codigo,
              sa.stock::numeric         AS stock,
              sa."stockMinimo"::numeric AS "stockMinimo",
              a.nombre                  AS almacen
       FROM stock_almacen sa
       JOIN productos p  ON p.id  = sa."productoId"
       JOIN almacenes a  ON a.id  = sa."almacenId"
       WHERE sa."empresaId"=$1 AND sa."isActive"=true
         AND sa."stockMinimo" > 0 AND sa.stock <= sa."stockMinimo"
       ORDER BY (sa.stock::numeric / NULLIF(sa."stockMinimo"::numeric, 0)) ASC
       LIMIT 10`,
      [empresaId],
    );

    // ── Últimas 5 órdenes despachadas ─────────────────────────────────────
    const ultimasDespachadas = await this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.almacen', 'a')
      .where('o.empresaId = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o.estado = :est', { est: EstadoPicking.DESPACHADA })
      .orderBy('o.fechaDespachado', 'DESC')
      .take(5)
      .getMany();

    return {
      resumen: { borrador, asignadas, enProceso, empacadas, despachadas },
      colaOperadores: colaOperadores.map(r => ({
        operadorId: r.operadorId,
        nombre: r.nombre ?? 'Sin nombre',
        ordenes: Number(r.ordenes),
      })),
      urgentes,
      pendienteDespacho: empacadas,
      ubicaciones: {
        total:   ubiStats?.total   ?? 0,
        activas: ubiStats?.activas ?? 0,
        enUso:   ubiStats?.enUso   ?? 0,
      },
      stockBajo,
      ultimasDespachadas,
    };
  }
}
