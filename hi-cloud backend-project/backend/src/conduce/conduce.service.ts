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
  conductor:              string;
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

  /**
   * Choferes ya usados por la empresa, del mas reciente al mas antiguo.
   *
   * No hay tabla de choferes y no hace falta: el catalogo es el historico.
   * El primero que se teclea queda disponible para el siguiente conduce, y un
   * chofer eventual no obliga a pasar por Configuracion. Si algun dia hay que
   * guardar cedula o licencia, este DISTINCT es la semilla de esa tabla.
   */
  async listarConductores(): Promise<string[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const rows = await this.ds.query<Array<{ conductor: string }>>(
      `SELECT btrim(conductor) AS conductor
         FROM conduces
        WHERE "empresaId" = $1 AND "isActive" = true
          AND conductor IS NOT NULL AND btrim(conductor) <> ''
        GROUP BY btrim(conductor)
        ORDER BY MAX(id) DESC
        LIMIT 100`,
      [empresaId],
    );
    return rows.map(r => r.conductor);
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
      // JOIN a facturas solo para poder filtrar por folio (no se selecciona, ya se enriquece después)
      .leftJoin('facturas', 'fac', 'fac.id = c."facturaId" AND fac."empresaId" = :facEid', { facEid: empresaId })
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a',  { a: true });

    if (estado) qb.andWhere('c.estado = :e', { e: estado });
    if (search) qb.andWhere(
      `(c.numero ILIKE :s OR cl.nombre ILIKE :s OR fac.folio ILIKE :s OR fac.folio = 'FAC-' || :sPlain)`,
      { s: `%${search}%`, sPlain: search },
    );

    const [data, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con folio de factura cuando el conduce fue creado desde una factura
    const facturaIds = [...new Set(data.filter(c => c.facturaId).map(c => c.facturaId!))];
    if (facturaIds.length > 0) {
      // El filtro por empresaId es redundante hoy (los facturaIds salen de
      // conduces ya acotados a la empresa), pero el aislamiento de tenant no se
      // deja depender de una invariante de la query anterior: toda lectura
      // cruzada lleva su propio empresaId.
      const facturas = await this.ds.query<{ id: number; folio: string }[]>(
        `SELECT id, folio FROM facturas WHERE id = ANY($1::int[]) AND "empresaId" = $2`,
        [facturaIds, empresaId],
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
        `SELECT folio FROM facturas WHERE id = $1 AND "empresaId" = $2 LIMIT 1`,
        [c.facturaId, empresaId],
      );
      if (rows[0]) (c as any).facturaFolio = rows[0].folio;
    }

    // Enriquecer con quién registró la devolución — el ticket y la ficha muestran
    // el nombre, no el id.
    if (c.devueltoPorUsuarioId) {
      const rows = await this.ds.query<{ nombre: string }[]>(
        `SELECT nombre FROM users WHERE id = $1 LIMIT 1`,
        [c.devueltoPorUsuarioId],
      );
      if (rows[0]) (c as any).devueltoPorNombre = rows[0].nombre;
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

  /**
   * Longitud mínima del motivo de devolución. No es un número mágico: es el
   * filtro para que "x" o "." no cuenten como motivo. Da para "No lo quiso" y
   * corta las pulsaciones sueltas.
   */
  private static readonly MOTIVO_DEVOLUCION_MIN = 10;

  /**
   * Devolver revierte una entrega y mueve el reporte de entrega, así que el
   * motivo se exige AQUÍ y no solo en el DTO: por el endpoint entran tres
   * pantallas distintas y da igual cuál de ellas se olvide de pedirlo.
   */
  async marcarDevuelto(id: number, motivo?: string, usuarioId?: number) {
    const c = await this.findOne(id);

    const limpio = String(motivo ?? '').trim();
    if (!limpio) {
      throw new BadRequestException('Indica el motivo de la devolución');
    }
    if (limpio.length < ConduceService.MOTIVO_DEVOLUCION_MIN) {
      throw new BadRequestException(
        `El motivo de la devolución debe explicar qué pasó ` +
        `(mínimo ${ConduceService.MOTIVO_DEVOLUCION_MIN} caracteres)`,
      );
    }

    await this.conduceRepo.update(id, {
      estado:               EstadoConduce.DEVUELTO,
      motivoDevolucion:     limpio.slice(0, 500),
      // Del CLS, nunca del body — mismo criterio que entregadoPorUsuarioId.
      devueltoPorUsuarioId: usuarioId || undefined,
      fechaDevolucion:      new Date(),
      // observacionesEntrega NO se toca: es la nota de la entrega y significa
      // otra cosa. Ver los comentarios de la entidad.
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
  // Búsqueda en cascada: exacto → sufijo numérico → parcial.
  // Un resultado → reporte completo. Varios → lista de candidatos.
  async getReporteEntrega(q: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const term    = q.trim();
    if (!term) return null;
    const termUp  = term.toUpperCase().replace(/\s+/g, '');
    const isDigit = /^\d+$/.test(termUp);

    // Acumuladores de IDs resueltos (deduplicados)
    const factIdsFound = new Set<number>();
    const condIdsFound = new Set<number>(); // solo conduces SIN facturaId

    const absorbC = (rows: Array<{ id: number; facturaId?: number | null }>) => {
      for (const r of rows) {
        if (r.facturaId) factIdsFound.add(r.facturaId);
        else             condIdsFound.add(r.id);
      }
    };
    const absorbF = (rows: Array<{ id: number }>) => rows.forEach(r => factIdsFound.add(r.id));

    // ── PASO 1: EXACTO ────────────────────────────────────────────────────────
    // 1a: conduce exacto
    absorbC(await this.ds.query(
      `SELECT id, "facturaId" FROM conduces
       WHERE numero = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 3`,
      [termUp, empresaId],
    ));
    // 1b: folio exacto o sin prefijo FAC-
    absorbF(await this.ds.query(
      `SELECT id FROM facturas
       WHERE (folio = $1 OR folio = 'FAC-' || $1)
         AND "empresaId" = $2 AND "isActive" = true LIMIT 3`,
      [termUp, empresaId],
    ));
    // 1c: e-NCF exacto
    absorbF(await this.ds.query(
      `SELECT f.id FROM facturas f JOIN ecf e ON e."facturaId" = f.id
       WHERE e.numero = $1 AND f."empresaId" = $2 AND f."isActive" = true LIMIT 3`,
      [termUp, empresaId],
    ));

    // ── PASO 2: SUFIJO NUMÉRICO (solo dígitos, paso 1 vacío) ─────────────────
    // Encuentra FAC-0418, CON-0418, E320000000418 cuando term = '418'
    if (isDigit && factIdsFound.size === 0 && condIdsFound.size === 0) {
      absorbC(await this.ds.query(
        `SELECT id, "facturaId" FROM conduces
         WHERE numero ~ ('^[A-Z]+-0*' || $1 || '$')
           AND "empresaId" = $2 AND "isActive" = true LIMIT 10`,
        [termUp, empresaId],
      ));
      absorbF(await this.ds.query(
        `SELECT id FROM facturas
         WHERE folio ~ ('^[A-Z]+-0*' || $1 || '$')
           AND "empresaId" = $2 AND "isActive" = true LIMIT 10`,
        [termUp, empresaId],
      ));
      absorbF(await this.ds.query(
        `SELECT f.id FROM facturas f JOIN ecf e ON e."facturaId" = f.id
         WHERE e.numero ~ ('0*' || $1 || '$')
           AND f."empresaId" = $2 AND f."isActive" = true LIMIT 5`,
        [termUp, empresaId],
      ));
    }

    // ── PASO 3: PARCIAL AMPLIO — último recurso, tope 20 ────────────────────
    if (factIdsFound.size === 0 && condIdsFound.size === 0) {
      const pat = `%${termUp}%`;
      absorbC(await this.ds.query(
        `SELECT id, "facturaId" FROM conduces
         WHERE numero ILIKE $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 10`,
        [pat, empresaId],
      ));
      absorbF(await this.ds.query(
        `SELECT id FROM facturas
         WHERE folio ILIKE $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 10`,
        [pat, empresaId],
      ));
    }

    const total = factIdsFound.size + condIdsFound.size;
    if (total === 0) return null;

    // ── MÚLTIPLES RESULTADOS → lista de candidatos para que el usuario elija ──
    if (total > 1) {
      const candidatos: any[] = [];
      if (factIdsFound.size > 0) {
        const fArr = [...factIdsFound].slice(0, 18);
        const rows = await this.ds.query<any[]>(
          `SELECT f.id, f.folio, f.fecha, f.total, f.estado, cl.nombre AS cn,
                  (SELECT e.numero FROM ecf e
                   WHERE e."facturaId" = f.id AND e."estadoDGII" = 'aceptado'
                   ORDER BY e.id DESC LIMIT 1) AS encf
           FROM facturas f LEFT JOIN clientes cl ON cl.id = f."clienteId"
           WHERE f.id = ANY($1::int[])
           ORDER BY f.fecha DESC`,
          [fArr],
        );
        rows.forEach(r => candidatos.push({
          tipo: 'factura', id: r.id,
          referencia: r.folio, encf: r.encf ?? null,
          clienteNombre: r.cn, fecha: r.fecha,
          total: Number(r.total ?? 0), estado: r.estado,
        }));
      }
      if (condIdsFound.size > 0) {
        const cArr = [...condIdsFound].slice(0, 5);
        const rows = await this.ds.query<any[]>(
          `SELECT c.id, c.numero, c.fecha, c.estado, cl.nombre AS cn
           FROM conduces c LEFT JOIN clientes cl ON cl.id = c."clienteId"
           WHERE c.id = ANY($1::int[])
           ORDER BY c.fecha DESC`,
          [cArr],
        );
        rows.forEach(r => candidatos.push({
          tipo: 'conduce_sin_factura', id: r.id,
          referencia: r.numero,
          clienteNombre: r.cn, fecha: r.fecha, estado: r.estado,
        }));
      }
      return { tipo: 'candidatos', busqueda: term, candidatos: candidatos.slice(0, 20) };
    }

    // ── RESULTADO ÚNICO → reporte completo directo ────────────────────────────
    let facturaId: number | null = factIdsFound.size === 1 ? [...factIdsFound][0] : null;
    let conduceDirectoId: number | null = condIdsFound.size === 1 ? [...condIdsFound][0] : null;

    // ── 2. Conduce suelto (sin factura) ──────────────────────────────────────
    if (conduceDirectoId) {
      const [cond] = await this.ds.query<any[]>(
        `SELECT c.id, c.numero, c.fecha, c.estado, c.conductor, c.vehiculo,
                c."contactoEntrega", c."telefonoContacto", c.notas,
                c."observacionesEntrega", c."fechaEntregaReal",
                c."motivoDevolucion", c."fechaDevolucion",
                ud.nombre AS "devueltoPorNombre",
                cl.nombre AS "clienteNombre"
         FROM conduces c
         LEFT JOIN clientes cl ON cl.id = c."clienteId"
         LEFT JOIN users ud ON ud.id = c."devueltoPorUsuarioId"
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
      `SELECT f.id, f.folio,
              (SELECT e.numero FROM ecf e
               WHERE e."facturaId" = f.id AND e."estadoDGII" = 'aceptado'
               ORDER BY e.id DESC LIMIT 1) AS encf,
              f.fecha, f.estado, f.total, f."clienteId",
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
              c."motivoDevolucion", c."fechaDevolucion",
              u.nombre  AS "entregadoPorNombre",
              ud.nombre AS "devueltoPorNombre"
       FROM conduces c
       LEFT JOIN users u  ON u.id  = c."entregadoPorUsuarioId"
       LEFT JOIN users ud ON ud.id = c."devueltoPorUsuarioId"
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
