import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  OrdenMantenimiento, TipoMantenimiento, PrioridadMantenimiento,
  EstadoMantenimiento,
} from './entities/orden-mantenimiento.entity';
import { ProgramaMantenimiento } from './entities/programa-mantenimiento.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class MantenimientoService {
  private readonly logger = new Logger(MantenimientoService.name);

  constructor(
    @InjectRepository(OrdenMantenimiento)  private ordenRepo:   Repository<OrdenMantenimiento>,
    @InjectRepository(ProgramaMantenimiento) private progRepo:  Repository<ProgramaMantenimiento>,
    private tenantService: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const n    = new Date();
    const yymm = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `MNT-${yymm}-`;
    const res = await this.ordenRepo
      .createQueryBuilder('o')
      .select(`MAX(CAST(SPLIT_PART(o.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('o.numero LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ maxNum: number | null }>();
    return `${prefix}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  // ── Órdenes de mantenimiento ──────────────────────────────────────────────

  async crearOrden(dto: any, userId: number) {
    const numero = await this.generarNumero();
    return this.ordenRepo.save(this.ordenRepo.create({
      ...dto,
      numero,
      userId,
      fechaProgramada: new Date(dto.fechaProgramada),
    }));
  }

  async listarOrdenes(pagination: PaginationDto, estado?: EstadoMantenimiento, activoId?: number) {
    const { limit = 15, page = 1 } = pagination;
    const qb = this.ordenRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.activo', 'a')
      .where('o.isActive = :ac AND o.empresaId = :eid', { ac: true, eid: this.tenantService.getEmpresaId() });

    if (estado)   qb.andWhere('o.estado = :e', { e: estado });
    if (activoId) qb.andWhere('o.activoId = :aid', { aid: activoId });

    const [data, total] = await qb
      .orderBy('o.fechaProgramada', 'ASC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async completarOrden(id: number, dto: { costoReal?: number; observaciones?: string; tecnico?: string }) {
    const o = await this.ordenRepo.findOne({ where: { id } });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);

    await this.ordenRepo.update(id, {
      estado:       EstadoMantenimiento.COMPLETADO,
      fechaRealizada: new Date(),
      costoReal:    dto.costoReal,
      observaciones:dto.observaciones,
      tecnico:      dto.tecnico,
    });

    // Actualizar programa de mantenimiento asociado si existe
    const prog = await this.progRepo.findOne({ where: { activoId: o.activoId, isActive: true } });
    if (prog) {
      const proxima = new Date();
      proxima.setDate(proxima.getDate() + prog.frecuenciaDias);
      await this.progRepo.update(prog.id, {
        ultimoMantenimiento: new Date(),
        proximoMantenimiento: proxima,
      });
    }

    return this.ordenRepo.findOne({ where: { id }, relations: ['activo'] });
  }

  async cancelarOrden(id: number) {
    await this.ordenRepo.update(id, { estado: EstadoMantenimiento.CANCELADO });
    return { ok: true };
  }

  // ── Programas de mantenimiento preventivo ────────────────────────────────

  async crearPrograma(dto: any) {
    const proxima = new Date();
    proxima.setDate(proxima.getDate() + (dto.frecuenciaDias ?? 30));
    return this.progRepo.save(this.progRepo.create({
      ...dto,
      proximoMantenimiento: proxima,
    }));
  }

  async listarProgramas() {
    return this.progRepo.find({
      where: { isActive: true, habilitado: true, empresaId: this.tenantService.getEmpresaId() },
      relations: ['activo'],
      order: { proximoMantenimiento: 'ASC' },
    });
  }

  async eliminarPrograma(id: number) {
    await this.progRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard() {
    const hoy      = new Date();
    const en7      = new Date(hoy); en7.setDate(hoy.getDate() + 7);
    const en30     = new Date(hoy); en30.setDate(hoy.getDate() + 30);

    const [programados, enProceso, completados, vencidos, proximos7, costoMes] = await Promise.all([
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoMantenimiento.PROGRAMADO } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoMantenimiento.EN_PROCESO } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoMantenimiento.COMPLETADO } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoMantenimiento.VENCIDO } }),
      this.ordenRepo.count({ where: { isActive: true, estado: EstadoMantenimiento.PROGRAMADO,
        fechaProgramada: Between(hoy, en7) } }),
      this.ordenRepo
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.costoReal), 0)', 'total')
        .where('o.estado = :e', { e: EstadoMantenimiento.COMPLETADO })
        .andWhere('o.fechaRealizada >= :inicio', {
          inicio: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
        })
        .getRawOne<{ total: string }>(),
    ]);

    const proximasProgramas = await this.progRepo.find({
      where: { isActive: true, habilitado: true, proximoMantenimiento: LessThanOrEqual(en30) },
      relations: ['activo'],
      order: { proximoMantenimiento: 'ASC' },
      take: 5,
    });

    const criticas = await this.ordenRepo.find({
      where: { isActive: true, estado: EstadoMantenimiento.PROGRAMADO,
               prioridad: PrioridadMantenimiento.CRITICA },
      relations: ['activo'],
      order: { fechaProgramada: 'ASC' },
      take: 5,
    });

    return {
      programados, enProceso, completados, vencidos, proximos7,
      costoMes:   Number(costoMes?.total ?? 0),
      proximasProgramas,
      criticas,
    };
  }

  // ── Cron: marcar vencidas ─────────────────────────────────────────────────

  @Cron('30 0 * * *')
  async marcarVencidas() {
    try {
      const result = await this.ordenRepo.update(
        { estado: EstadoMantenimiento.PROGRAMADO, fechaProgramada: LessThanOrEqual(new Date()) },
        { estado: EstadoMantenimiento.VENCIDO },
      );
      if ((result.affected ?? 0) > 0) {
        this.logger.log(`Mantenimiento: ${result.affected} órdenes marcadas como VENCIDAS`);
      }
    } catch (err) {
      this.logger.error(`Cron mantenimiento: ${(err as Error).message}`);
    }
  }
}
