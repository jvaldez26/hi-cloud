import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Presupuesto, TipoPresupuesto, EstadoPresupuesto } from './entities/presupuesto.entity';
import { PresupuestoLinea } from './entities/presupuesto-linea.entity';
import { CreatePresupuestoDto, CreatePresupuestoLineaDto } from './dto/create-presupuesto.dto';
import { FiltroPresupuestoDto } from './dto/filtro-presupuesto.dto';
import { TenantService } from '../tenant/tenant.service';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Injectable()
export class PresupuestosService {
  constructor(
    @InjectRepository(Presupuesto)
    private presupuestoRepository: Repository<Presupuesto>,
    @InjectRepository(PresupuestoLinea)
    private lineaRepository: Repository<PresupuestoLinea>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // CRUD Presupuestos
  // ──────────────────────────────────────────────────────────────────

  async create(dto: CreatePresupuestoDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.presupuestoRepository.findOne({
      where: { anio: dto.anio, tipo: dto.tipo, empresaId, isActive: true },
    } as any);
    if (existe) {
      throw new ConflictException(
        `Ya existe un presupuesto de ${dto.tipo} para el año ${dto.anio}`,
      );
    }

    const totalPresupuestado = dto.lineas
      ? dto.lineas.reduce((s, l) => s + l.montoPresupuestado, 0)
      : 0;

    const pres = await this.presupuestoRepository.save(
      this.presupuestoRepository.create({
        empresaId,
        ...dto,
        totalPresupuestado,
        userId,
      }),
    );

    if (dto.lineas?.length) {
      await this.lineaRepository.save(
        this.lineaRepository.create(
          dto.lineas.map((l) => ({
            ...l,
            categoria: l.categoria ?? 'General',
            presupuestoId: pres.id,
          })),
        ),
      );
    }

    return this.findById(pres.id);
  }

  async getPresupuestos(filtro: FiltroPresupuestoDto) {
    const { limit = 10, page = 1, anio, tipo, estado } = filtro;
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.presupuestoRepository
      .createQueryBuilder('p')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = :active', { active: true });

    if (anio)   qb.andWhere('p.anio = :anio', { anio });
    if (tipo)   qb.andWhere('p.tipo = :tipo', { tipo });
    if (estado) qb.andWhere('p.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('p.anio', 'DESC')
      .addOrderBy('p.tipo', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const p = await this.presupuestoRepository.findOne({
      where: { id, isActive: true },
      relations: ['lineas', 'user'],
    });
    if (!p) throw new NotFoundException(`Presupuesto #${id} no encontrado`);
    return p;
  }

  async addLinea(presupuestoId: number, dto: CreatePresupuestoLineaDto) {
    const pres = await this.findById(presupuestoId);
    if (pres.estado !== EstadoPresupuesto.BORRADOR) {
      throw new BadRequestException('Solo se pueden agregar líneas a presupuestos en BORRADOR');
    }

    const linea = await this.lineaRepository.save(
      this.lineaRepository.create({
        ...dto,
        categoria: dto.categoria ?? 'General',
        presupuestoId,
      }),
    );

    const total = await this.lineaRepository
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.montoPresupuestado), 0)', 'total')
      .where('l.presupuestoId = :id', { id: presupuestoId })
      .getRawOne<{ total: string }>();

    await this.presupuestoRepository.update(presupuestoId, {
      totalPresupuestado: Number(total?.total ?? 0),
    });

    return linea;
  }

  async updateLinea(lineaId: number, montoPresupuestado: number) {
    const linea = await this.lineaRepository.findOne({ where: { id: lineaId } });
    if (!linea) throw new NotFoundException(`Línea #${lineaId} no encontrada`);

    await this.lineaRepository.update(lineaId, { montoPresupuestado });

    const total = await this.lineaRepository
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.montoPresupuestado), 0)', 'total')
      .where('l.presupuestoId = :id', { id: linea.presupuestoId })
      .getRawOne<{ total: string }>();

    await this.presupuestoRepository.update(linea.presupuestoId, {
      totalPresupuestado: Number(total?.total ?? 0),
    });

    return this.lineaRepository.findOne({ where: { id: lineaId } });
  }

  async aprobar(id: number) {
    const pres = await this.findById(id);
    if (pres.estado !== EstadoPresupuesto.BORRADOR) {
      throw new BadRequestException('Solo se pueden aprobar presupuestos en BORRADOR');
    }
    await this.presupuestoRepository.update(id, { estado: EstadoPresupuesto.APROBADO });
    return this.findById(id);
  }

  async cerrar(id: number) {
    const pres = await this.findById(id);
    if (pres.estado === EstadoPresupuesto.CERRADO) {
      throw new BadRequestException('El presupuesto ya está cerrado');
    }
    await this.presupuestoRepository.update(id, { estado: EstadoPresupuesto.CERRADO });
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Análisis de Variación (Presupuestado vs Real)
  // ──────────────────────────────────────────────────────────────────

  private async obtenerRealVentas(anio: number): Promise<Record<number, number>> {
    const rows = await this.dataSource.query<{ mes: number; real: string }[]>(
      `SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
              COALESCE(SUM(total), 0) AS real
       FROM facturas
       WHERE "isActive" = true AND estado IN ('emitida','pagada')
         AND EXTRACT(YEAR FROM fecha) = $1
       GROUP BY EXTRACT(MONTH FROM fecha)`,
      [anio],
    );
    return Object.fromEntries(rows.map((r) => [r.mes, Number(r.real)]));
  }

  private async obtenerRealCompras(anio: number): Promise<Record<number, number>> {
    const rows = await this.dataSource.query<{ mes: number; real: string }[]>(
      `SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
              COALESCE(SUM(total), 0) AS real
       FROM compras
       WHERE "isActive" = true AND estado IN ('recibida','pagada')
         AND EXTRACT(YEAR FROM fecha) = $1
       GROUP BY EXTRACT(MONTH FROM fecha)`,
      [anio],
    );
    return Object.fromEntries(rows.map((r) => [r.mes, Number(r.real)]));
  }

  private async obtenerRealGastos(anio: number): Promise<Record<number, number>> {
    const rows = await this.dataSource.query<{ mes: number; real: string }[]>(
      `SELECT EXTRACT(MONTH FROM a.fecha)::int AS mes,
              COALESCE(SUM(l.debe), 0) AS real
       FROM asiento_lineas l
       JOIN asientos_contables a ON a.id = l."asientoId"
       JOIN cuentas_contables   c ON c.id = l."cuentaContableId"
       WHERE a.estado = 'contabilizado' AND a."isActive" = true AND l."isActive" = true
         AND c.tipo IN ('gasto','costo')
         AND EXTRACT(YEAR FROM a.fecha) = $1
       GROUP BY EXTRACT(MONTH FROM a.fecha)`,
      [anio],
    );
    return Object.fromEntries(rows.map((r) => [r.mes, Number(r.real)]));
  }

  async getAnalisisVariacion(presupuestoId: number) {
    const pres = await this.findById(presupuestoId);

    let realPorMes: Record<number, number> = {};
    switch (pres.tipo) {
      case TipoPresupuesto.VENTAS:
        realPorMes = await this.obtenerRealVentas(pres.anio); break;
      case TipoPresupuesto.COMPRAS:
        realPorMes = await this.obtenerRealCompras(pres.anio); break;
      case TipoPresupuesto.GASTOS:
        realPorMes = await this.obtenerRealGastos(pres.anio); break;
      default:
        realPorMes = {};
    }

    // Agrupar líneas por mes
    const presupPorMes: Record<number, number> = {};
    for (const l of pres.lineas ?? []) {
      presupPorMes[l.mes] = (presupPorMes[l.mes] ?? 0) + Number(l.montoPresupuestado);
    }

    const meses = Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
      const presupuestado = presupPorMes[mes] ?? 0;
      const real          = realPorMes[mes]   ?? 0;
      const variacion     = real - presupuestado;
      const porcentaje    = presupuestado > 0
        ? Number(((real / presupuestado) * 100).toFixed(1))
        : null;

      return {
        mes,
        etiqueta:       MESES[mes - 1],
        presupuestado:  Number(presupuestado.toFixed(2)),
        real:           Number(real.toFixed(2)),
        variacion:      Number(variacion.toFixed(2)),
        porcentajeEjec: porcentaje,
        estado:         variacion > 0 ? 'SOBRE_PRESUPUESTO' : variacion < 0 ? 'BAJO_PRESUPUESTO' : 'EN_META',
      };
    });

    const totalPresup = meses.reduce((s, m) => s + m.presupuestado, 0);
    const totalReal   = meses.reduce((s, m) => s + m.real, 0);

    return {
      presupuesto: { id: pres.id, nombre: pres.nombre, tipo: pres.tipo, anio: pres.anio },
      meses,
      totales: {
        presupuestado:  Number(totalPresup.toFixed(2)),
        real:           Number(totalReal.toFixed(2)),
        variacion:      Number((totalReal - totalPresup).toFixed(2)),
        porcentajeEjec: totalPresup > 0
          ? Number(((totalReal / totalPresup) * 100).toFixed(1))
          : null,
      },
      grafica: {
        labels:       meses.map((m) => m.etiqueta),
        presupuestado: meses.map((m) => m.presupuestado),
        real:          meses.map((m) => m.real),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Dashboard Presupuestal
  // ──────────────────────────────────────────────────────────────────

  async getDashboardPresupuestal(anio: number) {
    const presupuestosAnio = await this.presupuestoRepository.find({
      where: { anio, isActive: true, estado: EstadoPresupuesto.APROBADO },
      relations: ['lineas'],
    });

    if (presupuestosAnio.length === 0) {
      return { mensaje: `No hay presupuestos aprobados para ${anio}`, anio };
    }

    const [realVentas, realCompras, realGastos] = await Promise.all([
      this.obtenerRealVentas(anio),
      this.obtenerRealCompras(anio),
      this.obtenerRealGastos(anio),
    ]);

    const sumReal = (mapaReal: Record<number, number>) =>
      Object.values(mapaReal).reduce((s, v) => s + v, 0);

    const buildCard = (
      tipo: TipoPresupuesto,
      mapaReal: Record<number, number>,
    ) => {
      const pres = presupuestosAnio.find((p) => p.tipo === tipo);
      if (!pres) return null;
      const presup = Number(pres.totalPresupuestado);
      const real   = sumReal(mapaReal);
      return {
        tipo,
        nombre:         pres.nombre,
        presupuestado:  presup,
        real:           Number(real.toFixed(2)),
        variacion:      Number((real - presup).toFixed(2)),
        porcentajeEjec: presup > 0 ? Number(((real / presup) * 100).toFixed(1)) : null,
        alerta:         presup > 0 && real / presup > 1.1,
      };
    };

    return {
      anio,
      tarjetas: [
        buildCard(TipoPresupuesto.VENTAS,  realVentas),
        buildCard(TipoPresupuesto.COMPRAS, realCompras),
        buildCard(TipoPresupuesto.GASTOS,  realGastos),
      ].filter(Boolean),
      generadoEn: new Date().toISOString(),
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Comparativa Anual (todos los presupuestos del año de un vistazo)
  // ──────────────────────────────────────────────────────────────────

  async getComparativaAnual(anio: number) {
    const [ventas, compras, gastos] = await Promise.all([
      this.obtenerRealVentas(anio),
      this.obtenerRealCompras(anio),
      this.obtenerRealGastos(anio),
    ]);

    return {
      anio,
      meses: Array.from({ length: 12 }, (_, i) => ({
        mes:      i + 1,
        etiqueta: MESES[i],
        ventas:   ventas[i + 1]  ?? 0,
        compras:  compras[i + 1] ?? 0,
        gastos:   gastos[i + 1]  ?? 0,
        margenBruto: Number(((ventas[i + 1] ?? 0) - (compras[i + 1] ?? 0)).toFixed(2)),
      })),
    };
  }
}
