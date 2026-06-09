import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  OrdenMantenimiento, TipoMantenimiento, PrioridadMantenimiento,
  EstadoMantenimiento,
} from './entities/orden-mantenimiento.entity';
import { ProgramaMantenimiento } from './entities/programa-mantenimiento.entity';
import { ActivoFijo } from '../activos-fijos/entities/activo-fijo.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

interface RepuestoUsado { descripcion: string; costo: number }

interface CompletarOrdenDto {
  costoReal?:            number;
  observaciones?:        string;
  tecnico?:              string;
  fechaRealizada?:       string;
  proximoMantenimiento?: string;
  repuestosUsados?:      RepuestoUsado[];
}

@Injectable()
export class MantenimientoService {
  private readonly logger = new Logger(MantenimientoService.name);

  constructor(
    @InjectRepository(OrdenMantenimiento)    private ordenRepo:    Repository<OrdenMantenimiento>,
    @InjectRepository(ProgramaMantenimiento) private progRepo:     Repository<ProgramaMantenimiento>,
    @InjectRepository(ActivoFijo)            private activoRepo:   Repository<ActivoFijo>,
    @InjectDataSource()                      private ds:           DataSource,
    private tenantService:    TenantService,
    private asientosService:  AsientosAutomaticosService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'ordenes_mantenimiento', 'numero', '^MNT-[0-9]+$', 'MNT-', 1, empresaId,
    );
  }

  private async generarNumeroCron(empresaId: number): Promise<string> {
    return generarNumeroSecuencial(
      this.ds, 'ordenes_mantenimiento', 'numero', '^MNT-[0-9]+$', 'MNT-', 1, empresaId,
    );
  }

  // ── Órdenes de mantenimiento ──────────────────────────────────────────────

  async crearOrden(dto: any, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const numero = await this.generarNumero();
    return this.ordenRepo.save(this.ordenRepo.create({
      ...dto,
      numero,
      userId,
      empresaId,
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

  async findOrdenById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const o = await this.ordenRepo.findOne({ where: { id, empresaId }, relations: ['activo'] });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);
    return o;
  }

  async completarOrden(id: number, dto: CompletarOrdenDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const o = await this.ordenRepo.findOne({ where: { id, empresaId } });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);

    const fechaRealizada = dto.fechaRealizada ? new Date(dto.fechaRealizada) : new Date();

    await this.ordenRepo.update(id, {
      estado:          EstadoMantenimiento.COMPLETADO,
      fechaRealizada,
      costoReal:       dto.costoReal,
      observaciones:   dto.observaciones,
      tecnico:         dto.tecnico,
      repuestosUsados: dto.repuestosUsados,
    });

    // Actualizar fechaUltimoMantenimiento en el activo
    await this.activoRepo.update(o.activoId, { fechaUltimoMantenimiento: fechaRealizada });

    // Asiento contable fire-and-forget
    if (dto.costoReal && dto.costoReal > 0) {
      this.asientosService.asientoMantenimiento(id, dto.costoReal, o.numero, userId)
        .catch(err => this.logger.warn(`Asiento MNT ${o.numero}: ${(err as Error).message}`));
    }

    // Actualizar programa de mantenimiento asociado
    const prog = await this.progRepo.findOne({ where: { activoId: o.activoId, isActive: true } });
    if (prog) {
      let proxima: Date;
      if (dto.proximoMantenimiento) {
        proxima = new Date(dto.proximoMantenimiento);
      } else {
        proxima = new Date();
        proxima.setDate(proxima.getDate() + prog.frecuenciaDias);
      }
      await this.progRepo.update(prog.id, {
        ultimoMantenimiento: fechaRealizada,
        proximoMantenimiento: proxima,
      });
    }

    return this.ordenRepo.findOne({ where: { id }, relations: ['activo'] });
  }

  async cancelarOrden(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const o = await this.ordenRepo.findOne({ where: { id, empresaId } });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);
    await this.ordenRepo.update(id, { estado: EstadoMantenimiento.CANCELADO });
    return { ok: true };
  }

  // ── Programas de mantenimiento preventivo ────────────────────────────────

  async crearPrograma(dto: any) {
    const empresaId = this.tenantService.getEmpresaId();
    const proxima = new Date();
    proxima.setDate(proxima.getDate() + (dto.frecuenciaDias ?? 30));
    return this.progRepo.save(this.progRepo.create({
      ...dto,
      empresaId,
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
    const hoy       = new Date();
    const en7       = new Date(hoy); en7.setDate(hoy.getDate() + 7);
    const en30      = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const empresaId = this.tenantService.getEmpresaId();

    const [programados, enProceso, completados, vencidos, proximos7, costoMes] = await Promise.all([
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoMantenimiento.PROGRAMADO } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoMantenimiento.EN_PROCESO } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoMantenimiento.COMPLETADO } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoMantenimiento.VENCIDO } }),
      this.ordenRepo.count({ where: { isActive: true, empresaId, estado: EstadoMantenimiento.PROGRAMADO,
        fechaProgramada: Between(hoy, en7) } }),
      this.ordenRepo
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.costoReal), 0)', 'total')
        .where('o.empresaId = :eid', { eid: empresaId })
        .andWhere('o.estado = :e', { e: EstadoMantenimiento.COMPLETADO })
        .andWhere('o.fechaRealizada >= :inicio', {
          inicio: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
        })
        .getRawOne<{ total: string }>(),
    ]);

    const proximasProgramas = await this.progRepo.find({
      where: { isActive: true, habilitado: true, empresaId, proximoMantenimiento: LessThanOrEqual(en30) },
      relations: ['activo'],
      order: { proximoMantenimiento: 'ASC' },
      take: 5,
    });

    const criticas = await this.ordenRepo.find({
      where: { isActive: true, empresaId, estado: EstadoMantenimiento.PROGRAMADO,
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

  // ── Cron: auto-generar órdenes desde programas vencidos ──────────────────

  @Cron('0 7 * * *')
  async autoGenerarOrdenesPreventivas() {
    try {
      const hoy = new Date();
      const programas = await this.progRepo.find({
        where: { isActive: true, habilitado: true, proximoMantenimiento: LessThanOrEqual(hoy) },
      });

      if (programas.length === 0) return;

      let generadas = 0;
      for (const prog of programas) {
        if (!prog.empresaId) {
          this.logger.warn(`Programa #${prog.id} sin empresaId — omitido`);
          continue;
        }
        try {
          const numero = await this.generarNumeroCron(prog.empresaId);
          await this.ordenRepo.save(this.ordenRepo.create({
            empresaId:      prog.empresaId,
            activoId:       prog.activoId,
            numero,
            tipo:           prog.tipo,
            prioridad:      PrioridadMantenimiento.MEDIA,
            descripcion:    `Auto-preventivo: ${prog.descripcion}`,
            fechaProgramada: new Date(),
            costoEstimado:  prog.costoEstimado,
          }));
          generadas++;
        } catch (err) {
          this.logger.warn(`Auto-orden programa #${prog.id}: ${(err as Error).message}`);
        }
      }

      if (generadas > 0) {
        this.logger.log(`Auto-generadas ${generadas} órdenes preventivas`);
      }
    } catch (err) {
      this.logger.error(`Cron autoGenerarOrdenes: ${(err as Error).message}`);
    }
  }
}
