import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conduce, EstadoConduce } from './entities/conduce.entity';
import { ConduceDetalle } from './entities/conduce-detalle.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RealtimeService } from '../realtime/realtime.service';

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
  detalles:               DetalleConduceDto[];
}

@Injectable()
export class ConduceService {
  constructor(
    @InjectRepository(Conduce)        private conduceRepo:        Repository<Conduce>,
    @InjectRepository(ConduceDetalle) private detRepo:            Repository<ConduceDetalle>,
    @InjectRepository(FacturaDetalle) private factDetalleRepo:    Repository<FacturaDetalle>,
    private tenantSvc:       TenantService,
    private realtimeService: RealtimeService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d   = new Date();
    const pre = `CON-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.conduceRepo
      .createQueryBuilder('c')
      .select(`MAX(CAST(SPLIT_PART(c.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('c.numero LIKE :p',      { p: `${pre}%` })
      .andWhere('c.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
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
      .leftJoinAndSelect('c.cliente', 'cl')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a',  { a: true });

    if (estado) qb.andWhere('c.estado = :e', { e: estado });
    if (search) qb.andWhere('(c.numero ILIKE :s OR cl.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const c = await this.conduceRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Conduce #${id} no encontrado`);
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

  async marcarEntregado(id: number, observaciones?: string) {
    const c = await this.findOne(id);
    if (c.estado !== EstadoConduce.EN_TRANSITO) {
      throw new BadRequestException('El conduce debe estar EN TRÁNSITO para marcar como entregado');
    }
    await this.conduceRepo.update(id, {
      estado:               EstadoConduce.ENTREGADO,
      fechaEntregaReal:     new Date(),
      observacionesEntrega: observaciones,
    });
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

    // Verificar que la factura pertenece a esta empresa y obtener info del cliente
    const [factura] = await this.conduceRepo.query(
      `SELECT f.id, f."clienteId",
              c.nombre   AS "clienteNombre",
              c.direccion AS "clienteDireccion",
              c.telefono  AS "clienteTelefono",
              c.ciudad    AS "clienteCiudad"
       FROM facturas f
       LEFT JOIN clientes c ON c.id = f."clienteId"
       WHERE f.id = $1 AND f."empresaId" = $2 AND f."isActive" = true`,
      [facturaId, empresaId],
    );
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    // Detalles de la factura (producto eager-loaded)
    const detalles = await this.factDetalleRepo.find({ where: { facturaId } });

    // Suma de cantidades ya despachadas por productoId (conduces activos, no devueltos)
    const dispatched = await this.conduceRepo
      .createQueryBuilder('c')
      .innerJoin('c.detalles', 'cd')
      .select('cd.productoId',      'productoId')
      .addSelect('SUM(cd.cantidad)', 'despachado')
      .where('c.facturaId = :fid',  { fid: facturaId })
      .andWhere('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :a',  { a: true })
      .andWhere("c.estado != 'devuelto'")
      .groupBy('cd.productoId')
      .getRawMany<{ productoId: string; despachado: string }>();

    const dispatchMap = new Map(dispatched.map(d => [Number(d.productoId), Number(d.despachado)]));

    const items = detalles.map(d => {
      const cantFact = Number(d.cantidad) as number;
      const pid      = (d.productoId != null ? Number(d.productoId) : 0) as number;
      const cantDesp = (dispatchMap.get(pid) ?? 0) as number;
      const cantPend = Math.max(0, cantFact - cantDesp);
      return {
        facturaDetalleId:   d.id,
        productoId:         d.productoId,
        descripcion:        d.descripcion,
        unidadMedida:       (d.producto as any)?.unidadMedida ?? 'PZA',
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
      todosDespachados: items.every(i => i.cantidadPendiente === 0),
    };
  }
}
