import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Aprobacion, EstadoAprobacion, TipoAprobacion } from './entities/aprobacion.entity';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../users/enums/user-role.enum';
import { PaginationDto } from '../common/dto/pagination.dto';

interface SolicitarDto {
  tipo:                  TipoAprobacion;
  entidadId:             number;
  entidadRef?:           string;
  monto?:                number;
  comentarioSolicitud?:  string;
  nombreSolicitante?:    string;
}

@Injectable()
export class AprobacionesService {
  constructor(
    @InjectRepository(Aprobacion)
    private repo: Repository<Aprobacion>,
    private tenantSvc: TenantService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ─── Solicitar aprobación ─────────────────────────────────────────────────────

  async solicitar(dto: SolicitarDto, userId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Cancelar solicitudes previas pendientes del mismo objeto
    await this.repo.update(
      { empresaId, tipo: dto.tipo, entidadId: dto.entidadId, estado: EstadoAprobacion.PENDIENTE },
      { estado: EstadoAprobacion.RECHAZADO, comentarioResolucion: 'Reemplazada por nueva solicitud' },
    );

    return this.repo.save(
      this.repo.create({
        empresaId,
        ...dto,
        solicitadoPorId:  userId,
        nombreSolicitante: dto.nombreSolicitante,
      }),
    );
  }

  // ─── Aprobar ─────────────────────────────────────────────────────────────────

  async aprobar(id: number, userId: number, userRole: string, comentario?: string) {
    this.verificarPermiso(userRole);
    const aprobacion = await this.findOne(id);
    if (aprobacion.estado !== EstadoAprobacion.PENDIENTE) {
      throw new BadRequestException('Esta solicitud ya fue resuelta');
    }
    await this.repo.update(id, {
      estado:               EstadoAprobacion.APROBADO,
      aprobadoPorId:        userId,
      comentarioResolucion: comentario,
      fechaResolucion:      new Date(),
    });
    return this.findOne(id);
  }

  // ─── Rechazar ─────────────────────────────────────────────────────────────────

  async rechazar(id: number, userId: number, userRole: string, comentario: string) {
    this.verificarPermiso(userRole);
    const aprobacion = await this.findOne(id);
    if (aprobacion.estado !== EstadoAprobacion.PENDIENTE) {
      throw new BadRequestException('Esta solicitud ya fue resuelta');
    }
    await this.repo.update(id, {
      estado:               EstadoAprobacion.RECHAZADO,
      aprobadoPorId:        userId,
      comentarioResolucion: comentario,
      fechaResolucion:      new Date(),
    });
    return this.findOne(id);
  }

  // ─── Listar ───────────────────────────────────────────────────────────────────

  async listar(pagination: PaginationDto, estado?: EstadoAprobacion, tipo?: TipoAprobacion) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.empresaId = :eid', { eid: empresaId })
      .andWhere('a.isActive = :ac', { ac: true });

    if (estado) qb.andWhere('a.estado = :est', { est: estado });
    if (tipo)   qb.andWhere('a.tipo   = :tp',  { tp: tipo });

    qb.orderBy('a.createdAt', 'DESC').skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit: take, totalPages: Math.ceil(total / take) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const a = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!a) throw new NotFoundException(`Aprobación #${id} no encontrada`);
    return a;
  }

  async getEstado(tipo: TipoAprobacion, entidadId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.repo.findOne({
      where: { empresaId, tipo, entidadId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.repo
      .createQueryBuilder('a')
      .select('a.estado', 'estado')
      .addSelect('COUNT(a.id)', 'cantidad')
      .where('a.empresaId = :eid', { eid: empresaId })
      .andWhere('a.isActive = :ac', { ac: true })
      .groupBy('a.estado')
      .getRawMany<{ estado: string; cantidad: string }>();
    return {
      pendientes: Number(raw.find(r => r.estado === 'pendiente')?.cantidad ?? 0),
      aprobados:  Number(raw.find(r => r.estado === 'aprobado')?.cantidad  ?? 0),
      rechazados: Number(raw.find(r => r.estado === 'rechazado')?.cantidad ?? 0),
    };
  }

  // ─── Buscar documento para autocomplete ──────────────────────────────────────

  async buscarDocumento(
    tipo: TipoAprobacion,
    q: string,
  ): Promise<{ id: number; ref: string; monto: number; extra: string }[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const like = `%${(q ?? '').toLowerCase()}%`;

    switch (tipo) {
      case TipoAprobacion.COTIZACION:
        return this.dataSource.query(
          `SELECT c.id, c.numero AS ref, c.total::float AS monto, c.estado, cl.nombre AS extra
           FROM cotizaciones c
           LEFT JOIN clientes cl ON cl.id = c."clienteId"
           WHERE c."empresaId" = $1 AND c."isActive" = true
             AND (LOWER(c.numero) LIKE $2 OR LOWER(COALESCE(cl.nombre,'')) LIKE $2)
           ORDER BY c."createdAt" DESC LIMIT 10`,
          [empresaId, like],
        );

      case TipoAprobacion.PRE_FACTURA:
        return this.dataSource.query(
          `SELECT p.id, p.folio AS ref, p.total::float AS monto, p.estado, cl.nombre AS extra
           FROM pre_facturas p
           LEFT JOIN clientes cl ON cl.id = p."clienteId"
           WHERE p."empresaId" = $1 AND p."isActive" = true
             AND (LOWER(p.folio) LIKE $2 OR LOWER(COALESCE(cl.nombre,'')) LIKE $2)
           ORDER BY p."createdAt" DESC LIMIT 10`,
          [empresaId, like],
        );

      case TipoAprobacion.COMPRA:
        return this.dataSource.query(
          `SELECT c.id, c.folio AS ref, c.total::float AS monto, c.estado, pr.nombre AS extra
           FROM compras c
           LEFT JOIN proveedores pr ON pr.id = c."proveedorId"
           WHERE c."empresaId" = $1 AND c."isActive" = true
             AND (LOWER(c.folio) LIKE $2 OR LOWER(COALESCE(pr.nombre,'')) LIKE $2)
           ORDER BY c."createdAt" DESC LIMIT 10`,
          [empresaId, like],
        );

      case TipoAprobacion.GASTO:
        return this.dataSource.query(
          `SELECT g.id,
                  'GAS-' || LPAD(g.id::text, 6, '0') AS ref,
                  g.total::float AS monto,
                  g.descripcion AS extra
           FROM gastos g
           WHERE g."empresaId" = $1 AND g."isActive" = true
             AND (LOWER(g.descripcion) LIKE $2 OR LOWER(COALESCE(g.proveedor,'')) LIKE $2)
           ORDER BY g."createdAt" DESC LIMIT 10`,
          [empresaId, like],
        );

      case TipoAprobacion.NOTA_DEBITO:
        return this.dataSource.query(
          `SELECT nd.id, nd.numero AS ref, nd.total::float AS monto, nd.estado, cl.nombre AS extra
           FROM notas_debito nd
           LEFT JOIN clientes cl ON cl.id = nd."clienteId"
           WHERE nd."empresaId" = $1 AND nd."isActive" = true
             AND (LOWER(nd.numero) LIKE $2 OR LOWER(COALESCE(cl.nombre,'')) LIKE $2)
           ORDER BY nd."createdAt" DESC LIMIT 10`,
          [empresaId, like],
        );

      default:
        return [];
    }
  }

  private verificarPermiso(userRole: string) {
    if (![UserRole.ADMIN, UserRole.CONTADOR].includes(userRole as UserRole)) {
      throw new ForbiddenException('Solo ADMIN o CONTADOR pueden aprobar/rechazar');
    }
  }
}
