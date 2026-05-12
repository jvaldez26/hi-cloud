import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UbicacionAlmacen, TipoUbicacion } from './entities/ubicacion-almacen.entity';
import { OrdenPicking, EstadoPicking, TipoOrdenPicking } from './entities/orden-picking.entity';
import { OrdenPickingLinea, EstadoLineaPicking } from './entities/orden-picking-linea.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class WmsService {
  constructor(
    @InjectRepository(UbicacionAlmacen)
    private ubicRepo: Repository<UbicacionAlmacen>,
    @InjectRepository(OrdenPicking)
    private ordenRepo: Repository<OrdenPicking>,
    @InjectRepository(OrdenPickingLinea)
    private lineaRepo: Repository<OrdenPickingLinea>,
    private tenantService: TenantService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Numeración
  // ─────────────────────────────────────────────────────────────────────────
  private async nextNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const total = await this.ordenRepo.count({ where: { empresaId } });
    return `OP-${new Date().getFullYear()}-${String(total + 1).padStart(5, '0')}`;
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
    const qb = this.ubicRepo.createQueryBuilder('u')
      .leftJoinAndSelect('u.almacen', 'a')
      .where('u.empresaId = :eid', { eid: empresaId })
      .andWhere('u.isActive = true')
      .andWhere('u.activa = true');
    if (almacenId) qb.andWhere('u.almacenId = :aid', { aid: almacenId });
    if (tipo)      qb.andWhere('u.tipo = :tipo', { tipo });
    return qb.orderBy('u.pasillo', 'ASC').addOrderBy('u.estante', 'ASC').addOrderBy('u.nivel', 'ASC').getMany();
  }

  async updateUbicacion(id: number, dto: Partial<UbicacionAlmacen>) {
    const empresaId = this.tenantService.getEmpresaId();
    const u = await this.ubicRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!u) throw new NotFoundException(`Ubicación #${id} no encontrada`);
    await this.ubicRepo.update(id, dto as any);
    return this.ubicRepo.findOne({ where: { id } });
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
    const numero    = await this.nextNumero();

    const orden = await this.ordenRepo.save(
      this.ordenRepo.create({
        numero,
        tipo:            dto.tipo ?? TipoOrdenPicking.SALIDA_VENTA,
        almacenId:       dto.almacenId,
        facturaId:       dto.facturaId,
        transferId:      dto.transferId,
        prioridad:       dto.prioridad ?? 2,
        destinatario:    dto.destinatario,
        direccionEntrega: dto.direccionEntrega,
        observaciones:   dto.observaciones,
        creadoPorId:     dto.creadoPorId,
        estado:          EstadoPicking.BORRADOR,
        empresaId,
      }),
    );

    // Crear líneas — si la línea tiene ubicacionId, buscar el código
    const lineas = await Promise.all(dto.lineas.map(async (l, idx) => {
      let ubicacionCodigo: string | undefined;
      if (l.ubicacionId) {
        const ubic = await this.ubicRepo.findOne({ where: { id: l.ubicacionId } });
        ubicacionCodigo = ubic?.codigo;
      }
      return this.lineaRepo.create({
        ordenId:           orden.id,
        productoId:        l.productoId,
        ubicacionId:       l.ubicacionId,
        ubicacionCodigo,
        cantidadSolicitada: l.cantidadSolicitada,
        cantidadPickeada:  0,
        loteId:            l.loteId,
        numeroSerie:       l.numeroSerie,
        estado:            EstadoLineaPicking.PENDIENTE,
        orden_linea:       idx + 1,
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

  async despacharOrden(id: number, dto: { observaciones?: string }) {
    const o = await this.findOrdenById(id);
    if (o.estado !== EstadoPicking.EMPACADA) {
      throw new BadRequestException('La orden debe estar empacada para despachar');
    }
    await this.ordenRepo.update(id, {
      estado:           EstadoPicking.DESPACHADA,
      fechaDespachado:  new Date(),
      observaciones:    dto.observaciones ?? o.observaciones,
    } as any);
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

    // Ordenar líneas por pasillo → estante → nivel → posición
    const lineasOrdenadas = [...orden.lineas].sort((a, b) =>
      (a.ubicacionCodigo ?? 'zzz').localeCompare(b.ubicacionCodigo ?? 'zzz'),
    );

    // Actualizar orden_linea
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

    // Urgentes pendientes
    const urgentes = await this.ordenRepo.count({
      where: { empresaId, prioridad: 1, isActive: true } as any,
    });

    return {
      resumen: { borrador, asignadas, enProceso, empacadas, despachadas },
      colaOperadores: colaOperadores.map(r => ({
        operadorId: r.operadorId,
        nombre: r.nombre ?? 'Sin nombre',
        ordenes: Number(r.ordenes),
      })),
      urgentes,
      pendienteDespacho: empacadas,
    };
  }
}
