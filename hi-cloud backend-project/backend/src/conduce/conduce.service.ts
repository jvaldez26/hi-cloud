import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Conduce, EstadoConduce } from './entities/conduce.entity';
import { ConduceDetalle } from './entities/conduce-detalle.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { InventarioService } from '../inventario/inventario.service';

interface DetalleConduceDto {
  productoId?:     number;
  descripcion:     string;
  unidadMedida?:   string;
  cantidad:        number;
  observaciones?:  string;
}

interface CreateConduceDto {
  clienteId:              number;
  fecha:                  string;
  fechaEntregaProgramada?: string;
  facturaId?:             number;
  preFacturaId?:          number;
  direccionEntrega:       string;
  ciudad?:                string;
  contactoEntrega?:       string;
  telefonoContacto?:      string;
  conductor?:             string;
  vehiculo?:              string;
  notas?:                 string;
  sucursalId?:            number;
  almacenId?:             number;
  detalles:               DetalleConduceDto[];
}

@Injectable()
export class ConduceService {
  private readonly logger = new Logger(ConduceService.name);

  constructor(
    @InjectRepository(Conduce)        private conduceRepo:     Repository<Conduce>,
    @InjectRepository(ConduceDetalle) private detRepo:         Repository<ConduceDetalle>,
    private tenantSvc:       TenantService,
    private realtimeService: RealtimeService,
    @InjectDataSource() private ds: DataSource,
    private inventarioSvc:   InventarioService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(this.ds, 'conduces', 'numero', '^CON-[0-9]+$', 'CON-', 1, empresaId);
  }

  async crear(dto: CreateConduceDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

    const conduce = this.conduceRepo.create({
      empresaId,
      numero,
      clienteId:              dto.clienteId,
      usuarioId,
      fecha:                  dto.fecha as unknown as Date,
      fechaEntregaProgramada: dto.fechaEntregaProgramada as unknown as Date | undefined,
      facturaId:              dto.facturaId,
      preFacturaId:           dto.preFacturaId,
      direccionEntrega:       dto.direccionEntrega,
      ciudad:                 dto.ciudad,
      contactoEntrega:        dto.contactoEntrega,
      telefonoContacto:       dto.telefonoContacto,
      conductor:              dto.conductor,
      vehiculo:               dto.vehiculo,
      notas:                  dto.notas,
      sucursalId:             dto.sucursalId,
      almacenId:              dto.almacenId,
      detalles: dto.detalles.map(d => ({
        descripcion:    d.descripcion,
        productoId:     d.productoId,
        unidadMedida:   d.unidadMedida ?? 'PZA',
        cantidad:       d.cantidad,
        observaciones:  d.observaciones,
      })) as unknown as ConduceDetalle[],
    });

    const saved = await this.conduceRepo.save(conduce);
    this.realtimeService.notify(empresaId, 'conduce', 'created', saved.id);
    return saved;
  }

  async listar(pagination: PaginationDto, estado?: EstadoConduce) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.conduceRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente',  'cl')
      .leftJoinAndSelect('c.detalles', 'd')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a',  { a: true });

    if (estado) qb.andWhere('c.estado = :e', { e: estado });
    if (search) qb.andWhere('(c.numero ILIKE :s OR cl.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con folio de factura cuando el conduce fue creado desde una factura
    const facturaIds = [...new Set(data.filter(c => c.facturaId).map(c => c.facturaId!))];
    if (facturaIds.length > 0) {
      const facturas = await this.ds.query<{ id: number; folio: string }[]>(
        `SELECT id, folio FROM facturas WHERE id = ANY($1::int[])`,
        [facturaIds],
      );
      const folioMap = new Map(facturas.map(f => [f.id, f.folio]));
      data.forEach(c => {
        if (c.facturaId) (c as any).facturaFolio = folioMap.get(c.facturaId) ?? null;
      });
    }

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const c = await this.conduceRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Conduce #${id} no encontrado`);

    // Enriquecer con folio de factura
    if (c.facturaId) {
      const rows = await this.ds.query<{ folio: string }[]>(
        `SELECT folio FROM facturas WHERE id = $1 LIMIT 1`,
        [c.facturaId],
      );
      if (rows[0]) (c as any).facturaFolio = rows[0].folio;
    }

    return c;
  }

  // ─── Actualizar estado ────────────────────────────────────────────────────────

  async marcarEnTransito(id: number) {
    const c = await this.findOne(id);
    if (c.estado !== EstadoConduce.GENERADO) {
      throw new BadRequestException('El conduce debe estar en estado GENERADO');
    }
    await this.conduceRepo.update(id, { estado: EstadoConduce.EN_TRANSITO });
    this.realtimeService.notify(c.empresaId, 'conduce', 'updated', id);
    return this.findOne(id);
  }

  async marcarEntregado(id: number, observaciones?: string, usuarioId = 0) {
    const c = await this.findOne(id);
    if (c.estado !== EstadoConduce.EN_TRANSITO) {
      throw new BadRequestException('El conduce debe estar EN TRÁNSITO para marcar como entregado');
    }

    // Cargar detalles para descontar inventario
    const detalles = await this.detRepo.find({ where: { conduceId: id } as any });

    await this.conduceRepo.update(id, {
      estado:                EstadoConduce.ENTREGADO,
      fechaEntregaReal:      new Date(),
      observacionesEntrega:  observaciones,
      entregadoPorUsuarioId: usuarioId || undefined,
    });

    // Descontar inventario — no bloquear si falla (conduce ya marcado como entregado)
    for (const det of detalles) {
      if (!det.productoId) continue;
      await this.inventarioSvc
        .registrarSalida(det.productoId, Number(det.cantidad), usuarioId, 'Conduce entregado', c.numero)
        .catch((err: unknown) => {
          this.logger.warn(
            `[Conduce] registrarSalida para ${c.numero} prod #${det.productoId} falló: ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    this.realtimeService.notify(c.empresaId, 'conduce', 'updated', id);
    return this.findOne(id);
  }

  async marcarDevuelto(id: number, observaciones?: string, usuarioId?: number) {
    const c = await this.findOne(id);
    await this.conduceRepo.update(id, {
      estado:                EstadoConduce.DEVUELTO,
      observacionesEntrega:  observaciones,
      entregadoPorUsuarioId: usuarioId || undefined,
    });
    this.realtimeService.notify(c.empresaId, 'conduce', 'updated', id);
    return this.findOne(id);
  }

  async actualizar(id: number, dto: Partial<CreateConduceDto>) {
    const c = await this.findOne(id);
    if (c.estado === EstadoConduce.ENTREGADO) {
      throw new BadRequestException('No se puede editar un conduce entregado');
    }
    await this.conduceRepo.update(id, dto as any);
    this.realtimeService.notify(c.empresaId, 'conduce', 'updated', id);
    return this.findOne(id);
  }

  async eliminar(id: number) {
    const c = await this.findOne(id);
    if (c.estado === EstadoConduce.ENTREGADO) {
      throw new BadRequestException('No se puede eliminar un conduce entregado');
    }
    await this.conduceRepo.update(id, { isActive: false });
    this.realtimeService.notify(c.empresaId, 'conduce', 'deleted', id);
    return { ok: true };
  }

  // ── Reporte de entrega ─────────────────────────────────────────────────────
  // Resuelve un término (conduce.numero / factura.folio / factura.encf) y
  // devuelve el estado completo de entrega de la factura asociada.
  async getReporteEntrega(q: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const term = q.trim();
    if (!term) return null;

    // ── 1. Resolver el término ────────────────────────────────────────────────
    let facturaId: number | null = null;
    let conduceDirectoId: number | null = null;

    // Paso 1a: número de conduce exacto
    const [conduceRow] = await this.ds.query<{id: number; facturaId: number | null}[]>(
      `SELECT id, "facturaId" FROM conduces
       WHERE numero = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
      [term, empresaId],
    );
    if (conduceRow) {
      if (conduceRow.facturaId) facturaId = conduceRow.facturaId;
      else conduceDirectoId = conduceRow.id;
    }

    // Paso 1b: folio de factura exacto
    if (!facturaId && !conduceDirectoId) {
      const [factRow] = await this.ds.query<{id: number}[]>(
        `SELECT id FROM facturas
         WHERE folio = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
        [term, empresaId],
      );
      if (factRow) facturaId = factRow.id;
    }

    // Paso 1c: e-NCF exacto
    if (!facturaId && !conduceDirectoId) {
      const [ecfRow] = await this.ds.query<{id: number}[]>(
        `SELECT id FROM facturas
         WHERE encf = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
        [term, empresaId],
      );
      if (ecfRow) facturaId = ecfRow.id;
    }

    if (!facturaId && !conduceDirectoId) return null;

    // ── 2. Conduce suelto (sin factura) ──────────────────────────────────────
    if (conduceDirectoId) {
      const [cond] = await this.ds.query<any[]>(
        `SELECT c.id, c.numero, c.fecha, c.estado, c.conductor, c.vehiculo,
                c."contactoEntrega", c."telefonoContacto", c.notas,
                c."observacionesEntrega", c."fechaEntregaReal",
                cl.nombre AS "clienteNombre"
         FROM conduces c
         LEFT JOIN clientes cl ON cl.id = c."clienteId"
         WHERE c.id = $1 AND c."isActive" = true`,
        [conduceDirectoId],
      );
      const detalles = await this.ds.query(
        `SELECT descripcion, cantidad, "cantidadDevuelta", "unidadMedida", observaciones
         FROM conduce_detalles WHERE "conduceId" = $1 ORDER BY id`,
        [conduceDirectoId],
      );
      return {
        tipo:    'conduce_sin_factura',
        busqueda: term,
        mensaje: 'Conduce sin factura asociada — no hay cantidades pendientes que calcular.',
        conduce: { ...cond, detalles },
      };
    }

    // ── 3. Datos de la factura ────────────────────────────────────────────────
    const [factura] = await this.ds.query<any[]>(
      `SELECT f.id, f.folio, f.encf, f.fecha, f.estado, f.total, f."clienteId",
              cl.nombre AS "clienteNombre", cl."rncReceptor" AS "clienteRnc",
              cl.direccion AS "clienteDireccion", cl.telefono AS "clienteTelefono"
       FROM facturas f
       LEFT JOIN clientes cl ON cl.id = f."clienteId"
       WHERE f.id = $1 AND f."empresaId" = $2 AND f."isActive" = true`,
      [facturaId, empresaId],
    );
    if (!factura) return null;

    // ── 4. Líneas de la factura ───────────────────────────────────────────────
    const lineasFactura = await this.ds.query<any[]>(
      `SELECT fd."productoId", fd.descripcion, fd.cantidad, fd."precioUnitario",
              COALESCE(p."unidadMedida", 'PZA') AS "unidadMedida"
       FROM factura_detalles fd
       LEFT JOIN productos p ON p.id = fd."productoId"
       WHERE fd."facturaId" = $1
       ORDER BY fd.id`,
      [facturaId],
    );

    // ── 5. Conduces de esta factura con usuario entregador ────────────────────
    const conducesRows = await this.ds.query<any[]>(
      `SELECT c.id, c.numero, c.fecha, c.estado, c.conductor, c.vehiculo,
              c."contactoEntrega", c."telefonoContacto", c.notas,
              c."observacionesEntrega", c."fechaEntregaReal",
              c."entregadoPorUsuarioId",
              u.nombre AS "entregadoPorNombre"
       FROM conduces c
       LEFT JOIN users u ON u.id = c."entregadoPorUsuarioId"
       WHERE c."facturaId" = $1 AND c."empresaId" = $2 AND c."isActive" = true
       ORDER BY c.fecha, c.id`,
      [facturaId, empresaId],
    );

    // ── 6. Detalles de todos los conduces en un solo query ───────────────────
    let detallesConduces: any[] = [];
    if (conducesRows.length > 0) {
      const ids = conducesRows.map((c: any) => c.id);
      detallesConduces = await this.ds.query<any[]>(
        `SELECT cd."conduceId", cd."productoId", cd.descripcion, cd.cantidad,
                cd."cantidadDevuelta", cd."unidadMedida", cd.observaciones
         FROM conduce_detalles cd
         WHERE cd."conduceId" = ANY($1::int[])
         ORDER BY cd."conduceId", cd.id`,
        [ids],
      );
    }

    // ── 7. Cálculo por línea de factura ───────────────────────────────────────
    // Acumula netos separando entregado / en_transito / devuelto por productoId
    type Acc = { entregada: number; enTransito: number; devuelta: number };
    const calcMap = new Map<string, Acc>();

    for (const det of detallesConduces) {
      if (det.productoId == null) continue; // líneas libres → bloque aparte
      const key = String(det.productoId);
      if (!calcMap.has(key)) calcMap.set(key, { entregada: 0, enTransito: 0, devuelta: 0 });
      const acc = calcMap.get(key)!;

      const cant     = Number(det.cantidad);
      const devuelta = Number(det.cantidadDevuelta ?? 0);
      const neta     = cant - devuelta;
      const conduce  = conducesRows.find((r: any) => r.id === det.conduceId);
      if (!conduce) continue;

      if (conduce.estado === 'entregado') {
        acc.entregada  += neta;
        acc.devuelta   += devuelta;
      } else if (conduce.estado === 'generado' || conduce.estado === 'en_transito') {
        acc.enTransito += neta;
      } else if (conduce.estado === 'devuelto') {
        acc.devuelta   += cant; // conduce devuelto completo
      }
    }

    const lineas = lineasFactura.map((fl: any) => {
      const key  = fl.productoId != null ? String(fl.productoId) : null;
      const acc  = key ? (calcMap.get(key) ?? { entregada: 0, enTransito: 0, devuelta: 0 })
                       : { entregada: 0, enTransito: 0, devuelta: 0 };
      const cantFact    = Number(fl.cantidad);
      const entregada   = Math.round(acc.entregada   * 10000) / 10000;
      const enTransito  = Math.round(acc.enTransito  * 10000) / 10000;
      const devuelta    = Math.round(acc.devuelta    * 10000) / 10000;
      const pendiente   = Math.round((cantFact - entregada - enTransito) * 10000) / 10000;
      const precio      = Number(fl.precioUnitario ?? 0);

      let estadoLinea: 'COMPLETO' | 'PARCIAL' | 'PENDIENTE' | 'EXCEDIDO';
      if (pendiente < 0)                       estadoLinea = 'EXCEDIDO';
      else if (pendiente === 0)                estadoLinea = 'COMPLETO';
      else if (entregada > 0 || enTransito > 0) estadoLinea = 'PARCIAL';
      else                                     estadoLinea = 'PENDIENTE';

      return {
        productoId:         fl.productoId,
        descripcion:        fl.descripcion,
        unidadMedida:       fl.unidadMedida,
        cantidadFacturada:  cantFact,
        cantidadEntregada:  entregada,
        cantidadEnTransito: enTransito,
        cantidadDevuelta:   devuelta,
        cantidadPendiente:  pendiente,
        precioUnitario:     precio,
        valorPendiente:     pendiente > 0 ? Math.round(pendiente * precio * 100) / 100 : 0,
        estadoLinea,
      };
    });

    // Líneas libres (sin productoId) — informativas, no descuentan pendiente
    const lineasLibres = detallesConduces
      .filter((d: any) => d.productoId == null)
      .map((d: any) => {
        const c = conducesRows.find((r: any) => r.id === d.conduceId);
        return {
          descripcion:   d.descripcion,
          unidadMedida:  d.unidadMedida,
          cantidadTotal: Number(d.cantidad),
          conduceNumero: c?.numero ?? '',
          conduceEstado: c?.estado ?? '',
        };
      });

    const hayEnTransito       = lineas.some(l => l.cantidadEnTransito > 0);
    const totalFacturado      = lineas.reduce((s, l) => s + l.cantidadFacturada,  0);
    const totalEntregado      = lineas.reduce((s, l) => s + l.cantidadEntregada,  0);
    const porcentajeEntregado = totalFacturado > 0
      ? Math.round((totalEntregado / totalFacturado) * 100) : 0;
    const valorPendienteTotal = Math.round(
      lineas.reduce((s, l) => s + (l.valorPendiente ?? 0), 0) * 100) / 100;
    const valorEnTransitoTotal = Math.round(
      lineas.reduce((s, l) => s + l.cantidadEnTransito * l.precioUnitario, 0) * 100) / 100;

    let estadoGeneral: 'SIN_ENTREGAS' | 'PARCIAL' | 'COMPLETA';
    if (conducesRows.length === 0)                    estadoGeneral = 'SIN_ENTREGAS';
    else if (lineas.every(l => l.estadoLinea === 'COMPLETO')) estadoGeneral = 'COMPLETA';
    else                                               estadoGeneral = 'PARCIAL';

    return {
      tipo:    'factura',
      busqueda: term,
      factura: {
        id:       factura.id,
        folio:    factura.folio,
        encf:     factura.encf ?? null,
        fecha:    factura.fecha,
        estado:   factura.estado,
        total:    Number(factura.total ?? 0),
        cliente: {
          id:        factura.clienteId,
          nombre:    factura.clienteNombre,
          rnc:       factura.clienteRnc ?? null,
          direccion: factura.clienteDireccion ?? null,
          telefono:  factura.clienteTelefono  ?? null,
        },
      },
      estadoGeneral,
      hayEnTransito,
      porcentajeEntregado,
      lineas,
      lineasLibres,
      conduces: conducesRows.map((c: any) => ({
        ...c,
        detalles: detallesConduces
          .filter((d: any) => d.conduceId === c.id)
          .map((d: any) => ({
            productoId:      d.productoId,
            descripcion:     d.descripcion,
            cantidad:        Number(d.cantidad),
            cantidadDevuelta: Number(d.cantidadDevuelta ?? 0),
            unidadMedida:    d.unidadMedida,
            observaciones:   d.observaciones ?? null,
          })),
      })),
      valorPendienteTotal,
      valorEnTransitoTotal,
    };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.conduceRepo
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a', { a: true })
      .groupBy('c.estado')
      .getRawMany<{ estado: string; cantidad: string }>();

    return raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad) }));
  }

  async getPendientesPorFactura(facturaId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    const [factura] = await this.ds.query<any[]>(
      `SELECT f.id, f."clienteId",
              c.nombre    AS "clienteNombre",
              c.direccion AS "clienteDireccion",
              c.telefono  AS "clienteTelefono",
              c.ciudad    AS "clienteCiudad"
       FROM facturas f
       LEFT JOIN clientes c ON c.id = f."clienteId"
       WHERE f.id = $1 AND f."empresaId" = $2 AND f."isActive" = true`,
      [facturaId, empresaId],
    );
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const detalles = await this.ds.query<any[]>(
      `SELECT fd.id, fd."productoId", fd.descripcion, fd.cantidad,
              p."unidadMedida"
       FROM factura_detalles fd
       LEFT JOIN productos p ON p.id = fd."productoId"
       WHERE fd."facturaId" = $1`,
      [facturaId],
    );

    const dispatched = await this.ds.query<any[]>(
      // Bug fix: se resta cantidadDevuelta por línea para no contar devoluciones
      // parciales como entregado. Los conduces estado='devuelto' completo se excluyen.
      `SELECT cd."productoId",
              SUM(cd.cantidad - COALESCE(cd."cantidadDevuelta", 0)) AS despachado
       FROM conduces c
       JOIN conduce_detalles cd ON cd."conduceId" = c.id
       WHERE c."facturaId" = $1
         AND c."empresaId" = $2
         AND c."isActive" = true
         AND c.estado != 'devuelto'
         AND cd."productoId" IS NOT NULL
       GROUP BY cd."productoId"`,
      [facturaId, empresaId],
    );

    const dispMap = new Map(dispatched.map((d: any) => [Number(d.productoId), Number(d.despachado)]));

    const items = detalles.map((d: any) => {
      const cantFact = Number(d.cantidad);
      const pid      = d.productoId != null ? Number(d.productoId) : 0;
      const cantDesp = dispMap.get(pid) ?? 0;
      const cantPend = Math.max(0, cantFact - cantDesp);
      return {
        facturaDetalleId:   d.id,
        productoId:         d.productoId,
        descripcion:        d.descripcion,
        unidadMedida:       d.unidadMedida ?? 'PZA',
        cantidadFacturada:  cantFact,
        cantidadDespachada: cantDesp,
        cantidadPendiente:  cantPend,
      };
    });

    return {
      facturaId,
      cliente: {
        id:        factura.clienteId,
        nombre:    factura.clienteNombre,
        direccion: factura.clienteDireccion,
        telefono:  factura.clienteTelefono,
        ciudad:    factura.clienteCiudad,
      },
      detalles:         items,
      todosDespachados: items.every((i: any) => i.cantidadPendiente === 0),
    };
  }
}
