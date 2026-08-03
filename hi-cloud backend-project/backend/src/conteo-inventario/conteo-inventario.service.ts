import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In } from 'typeorm';
import { ConteoInventario, ConteoTipo } from './entities/conteo-inventario.entity';
import { LineaConteo } from './entities/linea-conteo.entity';
import { ConteoAjuste, AjusteTipo } from './entities/conteo-ajuste.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Movimiento, TipoMovimiento } from '../inventario/entities/movimiento.entity';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../users/enums/user-role.enum';

const ROLES_AJUSTE: ReadonlyArray<UserRole> = [UserRole.ADMIN, UserRole.CONTADOR];

// ── Tipos internos ────────────────────────────────────────────────────────────

type ProductoSnapshot = {
  productoId:      number;
  productoCodigo:  string | null;
  productoNombre:  string;
  unidadMedida:    string;
  costoUnitario:   number;
  cantidadSistema: number;
  ubicacionId:     number | null;
  tieneLotes:      boolean;
  tieneSeriales:   boolean;
};

export interface DigitarLineaResult {
  linea:              LineaConteo;
  diferencia:         number;
  movimientosVentana: number;
  requiereRecuento:   boolean;
  avisaSinCosto?:     true;
  status:             'capturada' | 'ya-registrada';
}

export interface LoteItemResult { lineaId: number; ok: true;  resultado: DigitarLineaResult; }
export interface LoteItemError  { lineaId: number; ok: false; error: string; }
export type LoteResultado = LoteItemResult | LoteItemError;

export interface CreateConteoInput {
  almacenId:   number;
  nombre:      string;
  tipo:        ConteoInventario['tipo'];
  modalidad:   ConteoInventario['modalidad'];
  umbralTipo:  ConteoInventario['umbralTipo'];
  umbralValor: number;
  filtros?:    Record<string, unknown> | null;
  notas?:      string;
}

// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConteoInventarioService {
  constructor(
    @InjectRepository(ConteoInventario) private conteoRepo:  Repository<ConteoInventario>,
    @InjectRepository(LineaConteo)      private lineaRepo:   Repository<LineaConteo>,
    @InjectRepository(ConteoAjuste)     private ajusteRepo:  Repository<ConteoAjuste>,
    @InjectRepository(Producto)         private prodRepo:    Repository<Producto>,
    @InjectRepository(Movimiento)       private movRepo:     Repository<Movimiento>,
    private dataSource: DataSource,
    private tenantSvc:  TenantService,
  ) {}

  // ── Consultas básicas ─────────────────────────────────────────────────────

  async listar(opts: { page?: number; limit?: number; estado?: string; almacenId?: number } = {}) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { page = 1, limit = 20, estado, almacenId } = opts;
    const where: Record<string, unknown> = { empresaId, isActive: true };
    if (estado)    where.estado    = estado;
    if (almacenId) where.almacenId = almacenId;

    const [items, total] = await this.conteoRepo.findAndCount({
      where: where as any,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async findOne(id: number): Promise<ConteoInventario> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const c = await this.conteoRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!c) throw new NotFoundException(`Conteo #${id} no encontrado`);
    return c;
  }

  resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.conteoRepo
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a', { a: true })
      .groupBy('c.estado')
      .getRawMany<{ estado: string; cantidad: string }>()
      .then(raw => raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad) })));
  }

  // ── HELPERS PRIVADOS ──────────────────────────────────────────────────────

  // Snapshot de productos para el almacén, con COALESCE para los 115 productos
  // sin fila en stock_almacen, ordenados por ubicación física + código.
  // Aplica los filtros del tipo de conteo sobre la lista base.
  private async snapshotProductos(
    almacenId: number,
    empresaId: number,
    tipo:      ConteoTipo,
    filtros:   Record<string, unknown> | null,
  ): Promise<ProductoSnapshot[]> {
    // Guardia explícita — no caer en silencio a 'total' para tipos no implementados
    const TIPOS_IMPLEMENTADOS: ConteoTipo[] = ['total', 'ubicacion', 'categoria', 'selectivo', 'marca'];
    if (!TIPOS_IMPLEMENTADOS.includes(tipo)) {
      throw new BadRequestException(
        `El tipo de conteo '${tipo}' no está disponible todavía. ` +
        `Tipos disponibles: ${TIPOS_IMPLEMENTADOS.join(', ')}.`,
      );
    }

    const params: unknown[] = [almacenId, empresaId];
    const extraWhere: string[] = [];

    if (tipo === 'selectivo' && Array.isArray(filtros?.productoIds)) {
      const ids = (filtros!.productoIds as unknown[]).filter(Number.isInteger);
      if (ids.length) { params.push(ids); extraWhere.push(`p.id = ANY($${params.length}::int[])`); }
    }
    if ((tipo === 'categoria') && Array.isArray(filtros?.categorias)) {
      params.push(filtros!.categorias as string[]);
      extraWhere.push(`p.categoria = ANY($${params.length}::text[])`);
    }
    if ((tipo === 'marca') && Array.isArray(filtros?.marcas)) {
      params.push(filtros!.marcas as string[]);
      extraWhere.push(`p.marca = ANY($${params.length}::text[])`);
    }
    if ((tipo === 'ubicacion') && Array.isArray(filtros?.ubicacionIds)) {
      const ids = (filtros!.ubicacionIds as unknown[]).filter(Number.isInteger);
      if (ids.length) { params.push(ids); extraWhere.push(`sa."ubicacionId" = ANY($${params.length}::int[])`); }
    }
    // 'proveedor' y 'ciclico_abc' no tienen campo en el esquema actual → tratar como 'total'

    const filterSql = extraWhere.length ? `AND ${extraWhere.join(' AND ')}` : '';

    return this.dataSource.query<ProductoSnapshot[]>(
      `SELECT
         p.id                                              AS "productoId",
         p.codigo                                         AS "productoCodigo",
         p.nombre                                         AS "productoNombre",
         p."unidadMedida",
         COALESCE(p."costoPromedio", 0)::float            AS "costoUnitario",
         COALESCE(sa.stock, p.stock, 0)::float            AS "cantidadSistema",
         sa."ubicacionId",
         EXISTS(
           SELECT 1 FROM lotes_producto lp
           WHERE lp."productoId" = p.id AND lp."empresaId" = $2 AND lp."isActive" = true
           LIMIT 1
         )                                                AS "tieneLotes",
         EXISTS(
           SELECT 1 FROM seriales_producto sp
           WHERE sp."productoId" = p.id AND sp."empresaId" = $2 AND sp."isActive" = true
           LIMIT 1
         )                                                AS "tieneSeriales"
       FROM productos p
       LEFT JOIN stock_almacen sa
         ON sa."productoId" = p.id
        AND sa."almacenId"  = $1
        AND sa."empresaId"  = $2
        AND sa."isActive"   = true
       LEFT JOIN wms_ubicaciones u
         ON u.id            = sa."ubicacionId"
        AND u."isActive"    = true
       WHERE p."empresaId" = $2
         AND p."isActive"  = true
         AND p.tipo        = 'producto'
         ${filterSql}
       ORDER BY
         CASE WHEN sa."ubicacionId" IS NULL THEN 1 ELSE 0 END,
         u.pasillo   ASC NULLS LAST,
         u.estante   ASC NULLS LAST,
         u.nivel     ASC NULLS LAST,
         u.posicion  ASC NULLS LAST,
         p.codigo    ASC NULLS LAST,
         p.nombre    ASC`,
      params,
    );
  }

  // Ventana de movimientos: [fechaGeneracion, min(fechaCorteConteo, ahora)].
  // Incluye movimientos sin almacenId (globales) y los del almacén del conteo.
  private async calcularMovimientosVentana(
    productoId:       number,
    empresaId:        number,
    almacenId:        number,
    fechaGeneracion:  Date,
    fechaCorteConteo: Date,
  ): Promise<number> {
    const ahora = new Date();
    const cierreVentana = fechaCorteConteo <= ahora ? fechaCorteConteo : ahora;

    const rows = await this.dataSource.query<[{ delta: string }]>(
      `SELECT COALESCE(SUM("cantidadNueva" - "cantidadAnterior"), 0) AS delta
       FROM movimientos_inventario
       WHERE "productoId" = $1
         AND "empresaId"  = $2
         AND ("almacenId" = $3 OR "almacenId" IS NULL)
         AND "createdAt"  >= $4
         AND "createdAt"  <= $5`,
      [productoId, empresaId, almacenId, fechaGeneracion, cierreVentana],
    );

    return Number(rows[0].delta);
  }

  // Avanza en_conteo → en_digitacion en la primera línea capturada.
  private async actualizarCabecera(conteoId: number): Promise<void> {
    const [conteo, lineas] = await Promise.all([
      this.conteoRepo.findOne({ where: { id: conteoId }, select: ['id', 'estado'] }),
      this.lineaRepo.find({
        where: { conteoId, isActive: true },
        select: ['cantidadContada', 'diferencia'],
      }),
    ]);
    if (!conteo) return;

    const lineasContadas   = lineas.filter(l => l.cantidadContada !== null).length;
    const totalDiferencias = lineas.filter(
      l => l.cantidadContada !== null && Number(l.diferencia) !== 0,
    ).length;

    const update: {
      lineasContadas: number;
      totalDiferencias: number;
      estado?: ConteoInventario['estado'];
    } = { lineasContadas, totalDiferencias };
    if (conteo.estado === 'en_conteo' && lineasContadas > 0) update.estado = 'en_digitacion';

    await this.conteoRepo.update(conteoId, update);
  }

  // ── CREAR ─────────────────────────────────────────────────────────────────

  // Genera la hoja completa: cabecera + snapshot de líneas en una transacción.
  //
  // Invariantes:
  //  · Un solo conteo abierto por almacén en cualquier momento.
  //  · cantidadSistema = COALESCE(stock_almacen.stock, productos.stock) del almacén.
  //  · costoUnitario = costoPromedio al momento (puede ser 0 — AVCO sin datos).
  //  · tieneLotes/tieneSeriales detectados vía EXISTS en las tablas de lotes/seriales.
  //  · orden congelado por ubicación física (pasillo→estante→nivel→posicion→código);
  //    productos sin ubicación van al final. Este orden gobierna la hoja impresa
  //    y la pantalla de digitación.
  //  · filtros del tipo (categoria, marca, ubicacion, selectivo) aplicados a la
  //    consulta base. 'proveedor' y 'ciclico_abc' sin campo en esquema → como 'total'.
  async crear(dto: CreateConteoInput, usuarioId: number): Promise<ConteoInventario> {
    const empresaId = this.tenantSvc.getEmpresaId();

    // ── Verificar que no hay conteo abierto en el mismo almacén ─────────────
    const abierto = await this.conteoRepo.findOne({
      where: {
        empresaId,
        almacenId: dto.almacenId,
        isActive:  true,
        estado:    Not(In(['ajustado', 'cerrado', 'anulado'] as ConteoInventario['estado'][])),
      },
    });
    if (abierto) {
      throw new ConflictException(
        `Ya existe un conteo abierto (${abierto.codigo}) en este almacén. ` +
        `Ciérralo o anúlalo antes de crear uno nuevo.`,
      );
    }

    // ── Snapshot de productos con filtros ────────────────────────────────────
    const productos = await this.snapshotProductos(
      dto.almacenId, empresaId, dto.tipo, dto.filtros ?? null,
    );
    if (productos.length === 0) {
      throw new BadRequestException(
        'Ningún producto coincide con los filtros del tipo de conteo seleccionado',
      );
    }

    // ── Transacción: secuencia + cabecera + líneas ───────────────────────────
    let conteoId!: number;

    await this.dataSource.transaction(async em => {
      // Número de secuencia dentro de la transacción para evitar huecos si hay rollback.
      const [seq] = await em.query<[{ num: string }]>(
        `SELECT siguiente_numero_secuencia($1, 'cnt') AS num`,
        [empresaId],
      );
      const codigo = `CNT-${String(seq.num).padStart(6, '0')}`;
      const ahora  = new Date();

      const conteoRep = em.getRepository(ConteoInventario);
      const lineaRep  = em.getRepository(LineaConteo);

      const conteo = await conteoRep.save(
        conteoRep.create({
          empresaId,
          codigo,
          nombre:           dto.nombre,
          tipo:             dto.tipo,
          modalidad:        dto.modalidad,
          umbralTipo:       dto.umbralTipo,
          umbralValor:      String(dto.umbralValor),
          almacenId:        dto.almacenId,
          filtros:          dto.filtros ?? null,
          fechaGeneracion:  ahora,
          fechaCorteConteo: ahora,  // se puede sobrescribir en iniciar()
          generadoPorId:    usuarioId,
          estado:           'borrador',
          totalLineas:      productos.length,
          notas:            dto.notas ?? null,
        }),
      );
      conteoId = conteo.id;

      // Bulk insert con QueryBuilder — una sola query para 500+ líneas
      await lineaRep
        .createQueryBuilder()
        .insert()
        .values(
          productos.map((p, idx) => ({
            empresaId,
            conteoId:           conteo.id,
            orden:              idx + 1,
            productoId:         p.productoId,
            productoCodigo:     p.productoCodigo ?? undefined,
            productoNombre:     p.productoNombre,
            unidadMedida:       p.unidadMedida,
            ubicacionId:        p.ubicacionId ?? undefined,
            tieneLotes:         p.tieneLotes,
            tieneSeriales:      p.tieneSeriales,
            cantidadSistema:    String(p.cantidadSistema),
            costoUnitario:      String(p.costoUnitario),
            diferencia:         '0',
            movimientosVentana: '0',
            estadoLinea:        'pendiente',
          })),
        )
        .execute();
    });

    return this.findOne(conteoId);
  }

  // ── INICIAR ───────────────────────────────────────────────────────────────

  async iniciar(id: number, fechaCorteConteo?: Date): Promise<ConteoInventario> {
    const conteo = await this.findOne(id);
    if (conteo.estado !== 'borrador') {
      throw new BadRequestException(`Solo conteos en borrador pueden iniciarse (actual: ${conteo.estado})`);
    }

    // fechaCorteConteo por defecto = ahora. El usuario puede fijarla al momento
    // en que cerró el almacén (ideal: mismo instante que fechaGeneracion → ventana 0).
    const corte = fechaCorteConteo ?? new Date();
    if (corte < conteo.fechaGeneracion) {
      throw new BadRequestException(
        'fechaCorteConteo no puede ser anterior a fechaGeneracion del conteo',
      );
    }

    await this.conteoRepo.update(id, {
      estado:           'en_conteo',
      fechaInicio:      new Date(),
      fechaCorteConteo: corte,
    });
    return this.findOne(id);
  }

  // ── MOVER A REVISIÓN ──────────────────────────────────────────────────────

  // Transición en_digitacion → en_revision.
  // Bloquea si hay líneas 'pendiente' (nunca contadas). El operador debe
  // decidir explícitamente qué hacer con ellas — digitarlas como 0 si el
  // producto no se encontró, o aceptar que quedan fuera del ajuste.
  // Esta función nunca asume que 'pendiente' equivale a 0.
  async moverARevision(id: number): Promise<ConteoInventario> {
    const conteo = await this.findOne(id);
    if (conteo.estado !== 'en_digitacion') {
      throw new BadRequestException(
        `Solo conteos en 'en_digitacion' pueden moverse a revisión (actual: ${conteo.estado})`,
      );
    }

    const lineas = conteo.lineas ?? [];
    const pendientes = lineas.filter(l => l.isActive && l.estadoLinea === 'pendiente');

    if (pendientes.length > 0) {
      // Listar hasta 10 líneas pendientes para orientar al operador
      const muestra = pendientes.slice(0, 10)
        .map(l => `#${l.id} ${l.productoNombre ?? l.productoId}`)
        .join(', ');
      const resto = pendientes.length > 10 ? ` y ${pendientes.length - 10} más` : '';

      throw new BadRequestException(
        `${pendientes.length} línea(s) sin capturar: ${muestra}${resto}. ` +
        `Digitelas (incluso como 0 si no se encontró el producto) antes de pasar a revisión.`,
      );
    }

    await this.conteoRepo.update(id, { estado: 'en_revision' });
    return this.findOne(id);
  }

  // ── CERRAR ────────────────────────────────────────────────────────────────

  async cerrar(id: number, usuarioId: number): Promise<ConteoInventario> {
    const conteo = await this.findOne(id);
    if (conteo.estado !== 'ajustado') {
      throw new BadRequestException(
        `Solo conteos en estado 'ajustado' pueden cerrarse (actual: ${conteo.estado})`,
      );
    }

    await this.conteoRepo.update(id, {
      estado:       'cerrado',
      fechaCierre:  new Date(),
      cerradoPorId: usuarioId,
    });
    return this.findOne(id);
  }

  // ── ANULAR ────────────────────────────────────────────────────────────────

  async anular(id: number): Promise<{ id: number; estado: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const conteo    = await this.findOne(id);

    const ANULABLES: ConteoInventario['estado'][] = [
      'borrador', 'en_conteo', 'en_digitacion', 'en_revision',
    ];
    if (!ANULABLES.includes(conteo.estado)) {
      throw new ForbiddenException(
        `Un conteo en estado '${conteo.estado}' no puede anularse. ` +
        `Los conteos ya ajustados o cerrados son inmutables.`,
      );
    }

    await this.conteoRepo.update(id, { estado: 'anulado', isActive: false });

    // findOne ya no lo encontrará (isActive=false), devolvemos el id directamente
    return { id, estado: 'anulado' };
  }

  // ── DIGITAR LÍNEA ─────────────────────────────────────────────────────────

  async digitarLinea(
    conteoId:  number,
    dto:       { lineaId: number; cantidadContada: number },
    usuarioId: number,
  ): Promise<DigitarLineaResult> {
    const empresaId = this.tenantSvc.getEmpresaId();

    if (dto.cantidadContada < 0) {
      throw new BadRequestException('La cantidad contada no puede ser negativa');
    }

    const conteo = await this.findOne(conteoId);
    if (conteo.estado !== 'en_conteo' && conteo.estado !== 'en_digitacion') {
      throw new BadRequestException(
        `Solo se puede digitar en 'en_conteo' o 'en_digitacion' (actual: ${conteo.estado})`,
      );
    }

    const linea = await this.lineaRepo.findOne({
      where: { id: dto.lineaId, conteoId, empresaId, isActive: true },
    });
    if (!linea) throw new NotFoundException(`Línea #${dto.lineaId} no encontrada en este conteo`);

    // ── Idempotencia: si el valor ya está registrado, no re-escribir ─────────
    // Previene que un reintento de conexión marque progreso falso en la UI.
    if (
      linea.cantidadContada !== null &&
      Number(linea.cantidadContada).toFixed(4) === dto.cantidadContada.toFixed(4)
    ) {
      return {
        linea,
        diferencia:         Number(linea.diferencia),
        movimientosVentana: Number(linea.movimientosVentana),
        requiereRecuento:   linea.estadoLinea === 'en_recuento',
        status:             'ya-registrada',
      };
    }

    // ── movimientosVentana — recalculado en cada digitación ─────────────────
    const movimientosVentana = await this.calcularMovimientosVentana(
      linea.productoId, empresaId, conteo.almacenId,
      conteo.fechaGeneracion, conteo.fechaCorteConteo,
    );

    const cantidadSistema = Number(linea.cantidadSistema);
    const diferencia = Number(
      (dto.cantidadContada - (cantidadSistema + movimientosVentana)).toFixed(4),
    );

    // ── Evaluación del umbral ──────────────────────────────────────────────
    const umbralValor   = Number(conteo.umbralValor);
    const costoUnitario = Number(linea.costoUnitario);
    const absDif        = Math.abs(diferencia);

    let requiereRecuento = false;
    let avisaSinCosto    = false;

    if (conteo.umbralTipo === 'valor') {
      if (costoUnitario === 0) {
        requiereRecuento = absDif >= umbralValor;
        avisaSinCosto    = true;
      } else {
        requiereRecuento = Math.abs(diferencia * costoUnitario) >= umbralValor;
      }
    } else {
      requiereRecuento = absDif >= umbralValor;
    }

    await this.lineaRepo.update(dto.lineaId, {
      cantidadContada:    String(dto.cantidadContada),
      diferencia:         String(diferencia),
      movimientosVentana: String(movimientosVentana),
      estadoLinea:        requiereRecuento ? 'en_recuento' : 'contada',
      ...(linea.contadaPorId == null ? { contadaPorId: usuarioId } : {}),
      contadaEn:          new Date(),
    });

    await this.actualizarCabecera(conteoId);

    const lineaActualizada = await this.lineaRepo.findOneOrFail({ where: { id: dto.lineaId } });
    const resultado: DigitarLineaResult = {
      linea:              lineaActualizada,
      diferencia,
      movimientosVentana,
      requiereRecuento,
      status:             'capturada',
    };
    if (avisaSinCosto) resultado.avisaSinCosto = true;
    return resultado;
  }

  // ── DIGITAR LOTE ──────────────────────────────────────────────────────────

  async digitarLote(
    conteoId:  number,
    items:     Array<{ lineaId: number; cantidadContada: number }>,
    usuarioId: number,
  ): Promise<LoteResultado[]> {
    const resultados: LoteResultado[] = [];

    for (const item of items) {
      try {
        const resultado = await this.digitarLinea(conteoId, item, usuarioId);
        resultados.push({ lineaId: item.lineaId, ok: true, resultado });
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : String(err);
        resultados.push({ lineaId: item.lineaId, ok: false, error: mensaje });
      }
    }

    return resultados;
  }

  // ── CAPTURAR RECUENTO ─────────────────────────────────────────────────────

  async capturarRecuento(
    conteoId:  number,
    dto:       { lineaId: number; cantidadRecuento: number },
    usuarioId: number,
  ): Promise<DigitarLineaResult> {
    const empresaId = this.tenantSvc.getEmpresaId();

    if (dto.cantidadRecuento < 0) {
      throw new BadRequestException('La cantidad de recuento no puede ser negativa');
    }

    const conteo = await this.findOne(conteoId);
    if (conteo.estado !== 'en_digitacion' && conteo.estado !== 'en_revision') {
      throw new BadRequestException(
        `El recuento solo se captura en 'en_digitacion' o 'en_revision' (actual: ${conteo.estado})`,
      );
    }

    const linea = await this.lineaRepo.findOne({
      where: { id: dto.lineaId, conteoId, empresaId, isActive: true },
    });
    if (!linea) throw new NotFoundException(`Línea #${dto.lineaId} no encontrada`);
    if (linea.estadoLinea !== 'en_recuento') {
      throw new BadRequestException(
        `La línea #${dto.lineaId} no está en 'en_recuento' (actual: ${linea.estadoLinea})`,
      );
    }

    const movimientosVentana = await this.calcularMovimientosVentana(
      linea.productoId, empresaId, conteo.almacenId,
      conteo.fechaGeneracion, conteo.fechaCorteConteo,
    );

    const diferencia = Number(
      (dto.cantidadRecuento - (Number(linea.cantidadSistema) + movimientosVentana)).toFixed(4),
    );

    await this.lineaRepo.update(dto.lineaId, {
      cantidadRecuento:   String(dto.cantidadRecuento),
      diferencia:         String(diferencia),
      movimientosVentana: String(movimientosVentana),
      estadoLinea:        'conciliada',
      recuentadoPorId:    usuarioId,
      recuentadaEn:       new Date(),
    });

    await this.actualizarCabecera(conteoId);

    const lineaActualizada = await this.lineaRepo.findOneOrFail({ where: { id: dto.lineaId } });
    return { linea: lineaActualizada, diferencia, movimientosVentana, requiereRecuento: false, status: 'capturada' };
  }

  // ── APLICAR AJUSTES ───────────────────────────────────────────────────────

  async aplicarAjustes(
    conteoId:   number,
    usuarioId:  number,
    usuarioRol: UserRole,
  ): Promise<ConteoInventario> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const conteo    = await this.findOne(conteoId);

    if (conteo.estado !== 'en_revision') {
      throw new BadRequestException(`Solo conteos 'en_revision' pueden ajustarse (actual: ${conteo.estado})`);
    }
    if (!ROLES_AJUSTE.includes(usuarioRol)) {
      throw new ForbiddenException('Solo un administrador o contador puede aplicar ajustes de inventario');
    }

    const lineas = conteo.lineas ?? [];
    const capturadores = new Set(lineas.filter(l => l.contadaPorId != null).map(l => l.contadaPorId!));
    if (capturadores.has(usuarioId)) {
      throw new ForbiddenException('El usuario que capturó líneas no puede aplicar los ajustes');
    }

    const enRecuento = lineas.filter(l => l.estadoLinea === 'en_recuento');
    if (enRecuento.length > 0) {
      throw new BadRequestException(`${enRecuento.length} línea(s) requieren recuento antes de ajustar`);
    }

    const aAjustar = lineas
      .filter(l => l.isActive && (l.estadoLinea === 'contada' || l.estadoLinea === 'conciliada') && Number(l.diferencia) !== 0)
      .sort((a, b) => a.productoId - b.productoId);

    if (aAjustar.length === 0) {
      await this.conteoRepo.update(conteoId, { estado: 'ajustado', ajustadoPorId: usuarioId, totalDiferencias: 0, valorDiferencia: '0.00' });
      return this.findOne(conteoId);
    }

    await this.dataSource.transaction(async em => {
      await em.query(`SET LOCAL lock_timeout = '5s'`);
      const prodRep   = em.getRepository(Producto);
      const movRep    = em.getRepository(Movimiento);
      const ajusteRep = em.getRepository(ConteoAjuste);
      const lineaRep  = em.getRepository(LineaConteo);
      const conteoRep = em.getRepository(ConteoInventario);
      let totalDif = 0, valorAcum = 0;

      for (const linea of aAjustar) {
        const delta = Number(linea.diferencia);
        const prod  = await prodRep.findOne({ where: { id: linea.productoId, empresaId, isActive: true }, lock: { mode: 'pessimistic_write' } });
        if (!prod) continue;

        const stockAntes   = Number(prod.stock);
        const stockDespues = Number((stockAntes + delta).toFixed(4));

        if (stockDespues < 0) {
          throw new BadRequestException(
            `Línea #${linea.id} — "${linea.productoNombre ?? linea.productoId}": ` +
            `stockActual(${stockAntes}) + diferencia(${delta}) = ${stockDespues}. Stock negativo no permitido.`,
          );
        }

        const costo   = Number(linea.costoUnitario);
        const impacto = Number((delta * costo).toFixed(2));
        const tipo: AjusteTipo = delta > 0 ? 'sobrante' : 'faltante';

        await prodRep.update(linea.productoId, { stock: stockDespues });
        await em.query(
          `INSERT INTO stock_almacen ("empresaId","almacenId","productoId",stock,"stockMinimo","isActive","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())
           ON CONFLICT ("almacenId","productoId") DO UPDATE SET stock=EXCLUDED.stock,"updatedAt"=NOW()`,
          [empresaId, conteo.almacenId, linea.productoId, stockDespues, Number((prod as any).stockMinimo ?? 0)],
        ).catch(() => {});

        const mov = await movRep.save(movRep.create({
          tipo: TipoMovimiento.AJUSTE, productoId: linea.productoId,
          cantidad: Math.abs(delta), cantidadAnterior: stockAntes, cantidadNueva: stockDespues,
          motivo: `Conteo físico ${conteo.codigo}`, referencia: conteo.codigo,
          userId: usuarioId, almacenId: conteo.almacenId, empresaId,
        }));

        await ajusteRep.save(ajusteRep.create({
          empresaId, conteoId, lineaId: linea.id, productoId: linea.productoId,
          movimientoId: mov.id, cantidadAntes: String(stockAntes), cantidadDespues: String(stockDespues),
          diferencia: String(delta), costoUnitario: String(costo), valorImpacto: String(impacto),
          tipo, avisaLotes: linea.tieneLotes, aplicadoPorId: usuarioId, aplicadoEn: new Date(),
        }));

        await lineaRep.update(linea.id, { estadoLinea: 'conciliada' });
        totalDif++;
        valorAcum += Math.abs(impacto);
      }

      await conteoRep.update(conteoId, { estado: 'ajustado', ajustadoPorId: usuarioId, totalDiferencias: totalDif, valorDiferencia: valorAcum.toFixed(2) });
    });

    return this.findOne(conteoId);
  }
}
