import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodoContable, EstadoPeriodo, MESES_ES } from './entities/periodo-contable.entity';
import { AsientoContable } from '../contabilidad/entities/asiento-contable.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreatePeriodoDto {
  anio:  number;
  mes:   number;
  notas?: string;
}

interface CerrarPeriodoDto {
  notasCierre?: string;
}

@Injectable()
export class PeriodoContableService {
  constructor(
    @InjectRepository(PeriodoContable)
    private periodoRepo: Repository<PeriodoContable>,
    @InjectRepository(AsientoContable)
    private asientoRepo: Repository<AsientoContable>,
    private tenantService: TenantService,
  ) {}

  // ─── Crear período individual ─────────────────────────────────────────────

  async crear(dto: CreatePeriodoDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();

    const existe = await this.periodoRepo.findOne({
      where: { empresaId, anio: dto.anio, mes: dto.mes },
    });
    if (existe) {
      throw new ConflictException(
        `Ya existe el período ${MESES_ES[dto.mes - 1]} ${dto.anio}`,
      );
    }

    const primerDia = new Date(dto.anio, dto.mes - 1, 1);
    const ultimoDia = new Date(dto.anio, dto.mes, 0);

    const periodo = this.periodoRepo.create({
      empresaId,
      anio:        dto.anio,
      mes:         dto.mes,
      nombre:      `${MESES_ES[dto.mes - 1]} ${dto.anio}`,
      fechaInicio: primerDia,
      fechaFin:    ultimoDia,
      notasCierre: dto.notas,
    });

    return this.periodoRepo.save(periodo);
  }

  // ─── Generar los 12 períodos de un año ────────────────────────────────────

  async generarAnio(anio: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const creados: PeriodoContable[] = [];

    for (let mes = 1; mes <= 12; mes++) {
      const existe = await this.periodoRepo.findOne({ where: { empresaId, anio, mes } });
      if (existe) continue;

      const primerDia = new Date(anio, mes - 1, 1);
      const ultimoDia = new Date(anio, mes, 0);

      const nuevo = await this.periodoRepo.save(
        this.periodoRepo.create({
          empresaId,
          anio,
          mes,
          nombre:      `${MESES_ES[mes - 1]} ${anio}`,
          fechaInicio: primerDia,
          fechaFin:    ultimoDia,
        }),
      );
      creados.push(nuevo);
    }

    return {
      creados: creados.length,
      mensaje: creados.length > 0
        ? `${creados.length} período(s) creado(s) para ${anio}`
        : `Todos los períodos de ${anio} ya existían`,
    };
  }

  // ─── Listar períodos ──────────────────────────────────────────────────────

  listar(anio?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const where: Record<string, unknown> = { empresaId, isActive: true };
    if (anio) where['anio'] = anio;
    return this.periodoRepo.find({ where, order: { anio: 'DESC', mes: 'DESC' } });
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const p = await this.periodoRepo.findOne({ where: { id, empresaId } });
    if (!p) throw new NotFoundException(`Período #${id} no encontrado`);
    return p;
  }

  // ─── Período actual (mes en curso) ────────────────────────────────────────

  getPeriodoActual() {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy       = new Date();
    return this.periodoRepo.findOne({
      where: {
        empresaId,
        anio:   hoy.getFullYear(),
        mes:    hoy.getMonth() + 1,
        estado: EstadoPeriodo.ABIERTO,
      },
    });
  }

  // ─── Validar que la fecha pertenece a un período abierto ──────────────────

  async validarPeriodoAbierto(fecha: Date | string): Promise<PeriodoContable> {
    const empresaId = this.tenantService.getEmpresaId();
    const d         = new Date(fecha);

    const periodo = await this.periodoRepo.findOne({
      where: { empresaId, anio: d.getFullYear(), mes: d.getMonth() + 1 },
    });

    if (!periodo) {
      throw new BadRequestException(
        `No existe período contable para ${MESES_ES[d.getMonth()]} ${d.getFullYear()}. Créalo desde Períodos Contables.`,
      );
    }
    if (periodo.estado === EstadoPeriodo.CERRADO) {
      throw new BadRequestException(
        `El período ${periodo.nombre} está CERRADO. No se permiten nuevos registros.`,
      );
    }
    if (periodo.estado === EstadoPeriodo.BLOQUEADO) {
      throw new BadRequestException(
        `El período ${periodo.nombre} está BLOQUEADO permanentemente.`,
      );
    }

    return periodo;
  }

  // ─── Cerrar período ───────────────────────────────────────────────────────

  async cerrar(id: number, userId: number, dto: CerrarPeriodoDto) {
    const periodo = await this.findOne(id);

    if (periodo.estado === EstadoPeriodo.BLOQUEADO) {
      throw new BadRequestException('Este período está bloqueado y no puede modificarse');
    }
    if (periodo.estado === EstadoPeriodo.CERRADO) {
      throw new BadRequestException('El período ya está cerrado');
    }

    // Calcular totales desde los asientos contabilizados del período
    const raw = await this.asientoRepo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a."totalDebe"), 0)',  'totalDebitos')
      .addSelect('COALESCE(SUM(a."totalHaber"), 0)', 'totalCreditos')
      .addSelect('COUNT(a.id)',                    'cantidad')
      .where('a.fecha >= :inicio', { inicio: periodo.fechaInicio })
      .andWhere('a.fecha <= :fin',  { fin:   periodo.fechaFin })
      .andWhere("a.estado = 'contabilizado'")
      .getRawOne<{ totalDebitos: string; totalCreditos: string; cantidad: string }>();

    const totalDebitos  = +(raw?.totalDebitos  ?? 0);
    const totalCreditos = +(raw?.totalCreditos ?? 0);
    const cantAsientos  = +(raw?.cantidad      ?? 0);

    await this.periodoRepo.update(id, {
      estado:           EstadoPeriodo.CERRADO,
      totalDebitos,
      totalCreditos,
      cantidadAsientos: cantAsientos,
      cerradoPorId:     userId,
      fechaCierre:      new Date(),
      notasCierre:      dto.notasCierre,
    });

    return this.findOne(id);
  }

  // ─── Reabrir período ──────────────────────────────────────────────────────

  async reabrir(id: number) {
    const periodo = await this.findOne(id);

    if (periodo.estado === EstadoPeriodo.BLOQUEADO) {
      throw new BadRequestException('Este período está bloqueado permanentemente y no puede reabrirse');
    }

    await this.periodoRepo.update(id, {
      estado:       EstadoPeriodo.ABIERTO,
      fechaCierre:  undefined,
      cerradoPorId: undefined,
    });

    return this.findOne(id);
  }

  // ─── Bloquear período ─────────────────────────────────────────────────────

  async bloquear(id: number) {
    const periodo = await this.findOne(id);

    if (periodo.estado === EstadoPeriodo.ABIERTO) {
      throw new BadRequestException('Cierra el período antes de bloquearlo');
    }

    await this.periodoRepo.update(id, { estado: EstadoPeriodo.BLOQUEADO });
    return this.findOne(id);
  }

  // ─── Resumen del año ──────────────────────────────────────────────────────

  async resumen(anio?: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const anioTarget = anio ?? new Date().getFullYear();

    const periodos = await this.periodoRepo.find({
      where: { empresaId, anio: anioTarget, isActive: true },
      order: { mes: 'ASC' },
    });

    const abiertos   = periodos.filter(p => p.estado === EstadoPeriodo.ABIERTO).length;
    const cerrados   = periodos.filter(p => p.estado === EstadoPeriodo.CERRADO).length;
    const bloqueados = periodos.filter(p => p.estado === EstadoPeriodo.BLOQUEADO).length;

    const totalDebitos  = periodos.reduce((s, p) => s + Number(p.totalDebitos),  0);
    const totalCreditos = periodos.reduce((s, p) => s + Number(p.totalCreditos), 0);

    return {
      anio:     anioTarget,
      periodos,
      abiertos,
      cerrados,
      bloqueados,
      total:    periodos.length,
      totalDebitos:  +totalDebitos.toFixed(2),
      totalCreditos: +totalCreditos.toFixed(2),
    };
  }
}
