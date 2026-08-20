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
      estado:               EstadoConduce.ENTREGADO,
      fechaEntregaReal:     new Date(),
      observacionesEntrega: observaciones,
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

  async marcarDevuelto(id: number, observaciones?: string) {
    const c = await this.findOne(id);
    await this.conduceRepo.update(id, {
      estado:               EstadoConduce.DEVUELTO,
      observacionesEntrega: observaciones,
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
      `SELECT cd."productoId", SUM(cd.cantidad) AS despachado
       FROM conduces c
       JOIN conduce_detalles cd ON cd."conduceId" = c.id
       WHERE c."facturaId" = $1
         AND c."empresaId" = $2
         AND c."isActive" = true
         AND c.estado != 'devuelto'
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
