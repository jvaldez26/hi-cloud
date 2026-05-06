import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const where: any = { empresaId, isActive: true };
    if (estado) where.estado = estado;
    if (tipo)   where.tipo   = tipo;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  Math.min(limit, 100),
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
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

  private verificarPermiso(userRole: string) {
    if (![UserRole.ADMIN, UserRole.CONTADOR].includes(userRole as UserRole)) {
      throw new ForbiddenException('Solo ADMIN o CONTADOR pueden aprobar/rechazar');
    }
  }
}
