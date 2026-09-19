import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CategoriaActivo,
  MetodoDepreciacion,
} from './entities/categoria-activo.entity';
import { ActivoFijo, EstadoActivo } from './entities/activo-fijo.entity';
import { DepreciacionActivo } from './entities/depreciacion-activo.entity';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { CreateActivoFijoDto } from './dto/create-activo-fijo.dto';
import { DarDeBajaDto } from './dto/dar-de-baja.dto';
import { FiltroActivosDto, FiltroDepreciacionDto } from './dto/filtro-activos.dto';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { ConfiguracionContableService } from '../contabilidad/services/configuracion-contable.service';
import { TenantService } from '../tenant/tenant.service';

// ── Categorías DGII según Ley 11-92 (Código Tributario RD) ──────────────────
interface SeedCategoria {
  codigo: string; nombre: string; tasaAnual: number;
  metodo: MetodoDepreciacion; vidaUtilAnios: number; descripcion: string;
  cuentaActivoCodigo: string; cuentaDepreciacionCodigo: string; cuentaGastoCodigo: string;
}

const CATEGORIAS_DGII: SeedCategoria[] = [
  {
    codigo: 'EDIF', nombre: 'Edificios y Mejoras a la Propiedad',
    tasaAnual: 5, metodo: MetodoDepreciacion.LINEA_RECTA, vidaUtilAnios: 20,
    descripcion: 'Art. 287 Código Tributario — 5% anual método lineal',
    cuentaActivoCodigo: '1.2.1.01', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
  {
    codigo: 'VEHI', nombre: 'Vehículos y Medios de Transporte',
    tasaAnual: 25, metodo: MetodoDepreciacion.SALDO_DECRECIENTE, vidaUtilAnios: 4,
    descripcion: 'Art. 287 Código Tributario — 25% anual saldo decreciente',
    cuentaActivoCodigo: '1.2.1.03', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
  {
    codigo: 'MAQE', nombre: 'Maquinaria y Equipos Industriales',
    tasaAnual: 15, metodo: MetodoDepreciacion.SALDO_DECRECIENTE, vidaUtilAnios: 7,
    descripcion: 'Art. 287 Código Tributario — 15% anual saldo decreciente',
    cuentaActivoCodigo: '1.2.1.01', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
  {
    codigo: 'COMP', nombre: 'Equipos de Cómputo y Tecnología',
    tasaAnual: 25, metodo: MetodoDepreciacion.SALDO_DECRECIENTE, vidaUtilAnios: 4,
    descripcion: 'Art. 287 Código Tributario — 25% anual saldo decreciente',
    cuentaActivoCodigo: '1.2.1.02', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
  {
    codigo: 'MOBL', nombre: 'Mobiliario y Equipo de Oficina',
    tasaAnual: 25, metodo: MetodoDepreciacion.SALDO_DECRECIENTE, vidaUtilAnios: 4,
    descripcion: 'Art. 287 Código Tributario — 25% anual saldo decreciente',
    cuentaActivoCodigo: '1.2.1.01', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
  {
    codigo: 'INST', nombre: 'Instalaciones y Remodelaciones',
    tasaAnual: 10, metodo: MetodoDepreciacion.LINEA_RECTA, vidaUtilAnios: 10,
    descripcion: 'Mejoras en propiedad arrendada — 10% anual lineal',
    cuentaActivoCodigo: '1.2.1.01', cuentaDepreciacionCodigo: '1.2.2.01', cuentaGastoCodigo: '6.2.1.01',
  },
];

@Injectable()
export class ActivosFijosService implements OnModuleInit {
  private readonly logger = new Logger(ActivosFijosService.name);

  constructor(
    @InjectRepository(CategoriaActivo)
    private categoriaRepository: Repository<CategoriaActivo>,
    @InjectRepository(ActivoFijo)
    private activoRepository: Repository<ActivoFijo>,
    @InjectRepository(DepreciacionActivo)
    private depreciacionRepository: Repository<DepreciacionActivo>,
    private asientosService: AsientosAutomaticosService,
    private configuracionService: ConfiguracionContableService,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Seed inicial
  // ──────────────────────────────────────────────────────────────────

  async onModuleInit() {
    // Sembrar categorías DGII
    const totalCat = await this.categoriaRepository.count();
    if (totalCat === 0) {
      await this.categoriaRepository.save(
        CATEGORIAS_DGII.map((c) => this.categoriaRepository.create(c)),
      );
      this.logger.log('Categorías DGII sembradas (6 categorías Ley 11-92)');
    }
    // Nota: las cuentas contables de depreciación (1.2.2, 6.2.1) ya forman
    // parte del PLAN_CUENTAS base que se siembra por empresa desde seedPlanCuentas().
    // No se siembran globalmente aquí para evitar duplicados cross-tenant.
  }

  // ──────────────────────────────────────────────────────────────────
  // Categorías
  // ──────────────────────────────────────────────────────────────────

  getCategorias() {
    return this.categoriaRepository.find({
      where: { isActive: true },
      order: { codigo: 'ASC' },
    });
  }

  async createCategoria(dto: CreateCategoriaDto) {
    const existe = await this.categoriaRepository.findOne({ where: { codigo: dto.codigo } });
    if (existe) throw new ConflictException(`Categoría ${dto.codigo} ya existe`);
    return this.categoriaRepository.save(this.categoriaRepository.create(dto));
  }

  // ──────────────────────────────────────────────────────────────────
  // Activos Fijos — CRUD
  // ──────────────────────────────────────────────────────────────────

  async createActivo(dto: CreateActivoFijoDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.activoRepository.findOne({ where: { codigo: dto.codigo, empresaId } });
    if (existe) throw new ConflictException(`Activo ${dto.codigo} ya registrado`);

    const categoria = await this.categoriaRepository.findOne({
      where: { id: dto.categoriaId, isActive: true },
    });
    if (!categoria) throw new NotFoundException(`Categoría #${dto.categoriaId} no encontrada`);

    const vidaUtil = dto.vidaUtilAnios ?? categoria.vidaUtilAnios;
    // cuentaContrapartida es solo para el asiento de alta — no es un campo del activo.
    const { cuentaContrapartida, ...datosActivo } = dto;

    const activo = this.activoRepository.create({
      empresaId,
      ...datosActivo,
      vidaUtilAnios:        vidaUtil,
      valorResidual:        dto.valorResidual ?? 0,
      valorLibros:          dto.costoAdquisicion,
      depreciacionAcumulada: 0,
      userId,
    });

    const guardado = await this.activoRepository.save(activo);

    // Asiento contable de alta — fire-and-forget (el activo ya quedó
    // registrado; un problema contable no puede tumbar el alta). La cuenta
    // del activo es de la categoría (configuración), la contrapartida es el
    // selector por documento (de contado o a crédito).
    const cuentaActivo = categoria.cuentaActivoCodigo
      || await this.configuracionService.resolverCuenta(empresaId, 'ACTIVO_FIJO_DEFAULT');
    await this.asientosService.asientoAltaActivo(
      guardado.id, Number(dto.costoAdquisicion), dto.codigo, cuentaActivo,
      dto.fechaAdquisicion, userId, cuentaContrapartida, !!cuentaContrapartida,
    ).catch(err => this.logger.error(`Error asiento alta de activo ${dto.codigo}: ${err?.message ?? err}`));

    return guardado;
  }

  /** Panel de vista previa: calcula el asiento de alta SIN registrar el activo. */
  async previsualizarAltaActivo(dto: CreateActivoFijoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const categoria = await this.categoriaRepository.findOne({ where: { id: dto.categoriaId, isActive: true } });
    if (!categoria) throw new NotFoundException(`Categoría #${dto.categoriaId} no encontrada`);
    const cuentaActivo = categoria.cuentaActivoCodigo
      || await this.configuracionService.resolverCuenta(empresaId, 'ACTIVO_FIJO_DEFAULT');
    return this.asientosService.previsualizarAltaActivo(
      Number(dto.costoAdquisicion), dto.codigo, cuentaActivo, dto.cuentaContrapartida,
    );
  }

  async getActivos(filtro: FiltroActivosDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, categoriaId, estado } = filtro;

    const qb = this.activoRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.categoria', 'cat')
      .where('a.empresaId = :eid', { eid: empresaId })
      .andWhere('a.isActive = :active', { active: true });

    if (categoriaId) qb.andWhere('a.categoriaId = :cid', { cid: categoriaId });
    if (estado)      qb.andWhere('a.estado = :estado', { estado });
    if (search) {
      qb.andWhere(
        '(a.codigo ILIKE :s OR a.descripcion ILIKE :s OR a.ubicacion ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('a.fechaAdquisicion', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findActivoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const a = await this.activoRepository.findOne({
      where: { id, isActive: true, empresaId },
      relations: ['categoria', 'user'],
    });
    if (!a) throw new NotFoundException(`Activo #${id} no encontrado`);
    return a;
  }

  async updateActivo(id: number, dto: Partial<CreateActivoFijoDto>) {
    const activo = await this.findActivoById(id);
    if (activo.estado !== EstadoActivo.ACTIVO) {
      throw new BadRequestException('Solo se pueden editar activos en estado ACTIVO');
    }
    await this.activoRepository.update(id, dto);
    return this.findActivoById(id);
  }

  async darDeBaja(id: number, dto: DarDeBajaDto, userId: number) {
    const activo = await this.findActivoById(id);

    if (activo.estado === EstadoActivo.DADO_DE_BAJA || activo.estado === EstadoActivo.VENDIDO) {
      throw new BadRequestException('El activo ya fue dado de baja o vendido');
    }

    const estado = (dto.valorVenta !== undefined && dto.valorVenta > 0)
      ? EstadoActivo.VENDIDO
      : EstadoActivo.DADO_DE_BAJA;

    await this.activoRepository.update(id, {
      estado,
      fechaBaja:   new Date(dto.fecha),
      motivoBaja:  dto.motivo,
      valorVenta:  dto.valorVenta,
    });

    this.logger.log(`Activo "${activo.codigo}" dado de baja. Estado: ${estado}`);
    return this.findActivoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cálculo de Depreciación DGII
  // ──────────────────────────────────────────────────────────────────

  private calcularDepreciacionMensual(activo: ActivoFijo): number {
    const costo    = Number(activo.costoAdquisicion);
    const residual = Number(activo.valorResidual);
    const libros   = Number(activo.valorLibros);
    const tasa     = Number(activo.categoria.tasaAnual) / 100 / 12;

    if (libros <= residual) return 0;

    let dep: number;
    if (activo.categoria.metodo === MetodoDepreciacion.LINEA_RECTA) {
      dep = (costo - residual) / (activo.vidaUtilAnios * 12);
    } else {
      dep = libros * tasa;
    }

    const maxDep = libros - residual;
    return Number(Math.min(dep, maxDep).toFixed(2));
  }

  // Cálculo PURO (sin persistir nada) del desglose de depreciación de un
  // período — usado tanto por procesarDepreciacionMensual() (persiste) como
  // por previsualizarDepreciacion() (panel de vista previa, no toca la BD).
  // Desglose por (cuentaGasto, cuentaDepreciacion) — CategoriaActivo.
  // cuentaGastoCodigo/cuentaDepreciacionCodigo ya existían pero nunca se
  // leían; el asiento siempre iba a las mismas 2 cuentas fijas sin importar
  // la categoría del activo. Fallback a esas mismas 2 cuentas cuando una
  // categoría no tiene el campo lleno (nullable en la entidad) — nunca se
  // rompe un asiento por esto.
  private async calcularDesgloseDepreciacion(periodo: string) {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new BadRequestException('Período debe tener formato YYYY-MM');
    }
    const empresaId = this.tenantService.getEmpresaId();

    const [year, month] = periodo.split('-').map(Number);
    const fechaInicio = new Date(year, month - 1, 1);
    const fechaFin    = new Date(year, month, 0);
    // 'YYYY-MM-DD' del último día del período — con getters locales, nunca
    // toISOString() (correría el día si el offset del servidor no fuera 0).
    const fechaFinStr = `${fechaFin.getFullYear()}-${String(fechaFin.getMonth() + 1).padStart(2, '0')}-${String(fechaFin.getDate()).padStart(2, '0')}`;

    const activos = await this.activoRepository.find({
      where: { estado: EstadoActivo.ACTIVO, isActive: true, empresaId },
      relations: ['categoria'],
    });

    const calculos: {
      activo: ActivoFijo; dep: number; nuevoAcumulado: number; nuevoLibros: number; totallyDep: boolean;
      cuentaGasto: string; cuentaDepreciacion: string;
    }[] = [];
    const desglosePorCuentas = new Map<string, { cuentaGasto: string; cuentaDepreciacion: string; monto: number }>();

    for (const activo of activos) {
      const fechaAdq = new Date(activo.fechaAdquisicion);
      // No depreciar activos adquiridos después del período
      if (fechaAdq > fechaFin) continue;

      const dep = this.calcularDepreciacionMensual(activo);
      if (dep === 0) continue;

      const cuentaGasto        = activo.categoria.cuentaGastoCodigo || '6.2.1.01';
      const cuentaDepreciacion = activo.categoria.cuentaDepreciacionCodigo || '1.2.2.01';
      const keyCuentas = `${cuentaGasto}|${cuentaDepreciacion}`;
      const acc = desglosePorCuentas.get(keyCuentas) ?? { cuentaGasto, cuentaDepreciacion, monto: 0 };
      acc.monto = +(acc.monto + dep).toFixed(2);
      desglosePorCuentas.set(keyCuentas, acc);

      const nuevoAcumulado = Number((Number(activo.depreciacionAcumulada) + dep).toFixed(2));
      const nuevoLibros    = Number((Number(activo.valorLibros) - dep).toFixed(2));
      const totallyDep     = nuevoLibros <= Number(activo.valorResidual);

      calculos.push({ activo, dep, nuevoAcumulado, nuevoLibros, totallyDep, cuentaGasto, cuentaDepreciacion });
    }

    return { empresaId, fechaInicio, fechaFin, fechaFinStr, totalActivos: activos.length, calculos, desglosePorCuentas };
  }

  async procesarDepreciacionMensual(periodo: string, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();

    // Verificar que no se haya procesado ya para esta empresa
    const yaProcesado = await this.depreciacionRepository.count({
      where: { periodo, isActive: true, empresaId } as any,
    });
    if (yaProcesado > 0) {
      throw new ConflictException(`El período ${periodo} ya tiene depreciación registrada`);
    }

    const { fechaInicio, fechaFin, fechaFinStr, totalActivos, calculos, desglosePorCuentas } =
      await this.calcularDesgloseDepreciacion(periodo);

    if (totalActivos === 0) {
      throw new BadRequestException('No hay activos activos para depreciar');
    }
    if (calculos.length === 0) {
      return { mensaje: 'No se encontraron activos que depreciar en este período', registros: 0 };
    }

    const registros: Partial<DepreciacionActivo>[] = calculos.map((c) => ({
      activoId:            c.activo.id,
      empresaId,
      periodo,
      fechaInicio,
      fechaFin,
      tasaAplicada:        Number(c.activo.categoria.tasaAnual),
      metodo:              c.activo.categoria.metodo,
      valorLibrosInicio:   Number(c.activo.valorLibros),
      montoDepreciacion:   c.dep,
      valorLibrosFin:      c.nuevoLibros,
      depreciacionAcumulada: c.nuevoAcumulado,
      userId,
    } as any));

    for (const c of calculos) {
      await this.activoRepository.update(c.activo.id, {
        valorLibros:           c.nuevoLibros,
        depreciacionAcumulada: c.nuevoAcumulado,
        estado: c.totallyDep ? EstadoActivo.TOTALMENTE_DEPRECIADO : EstadoActivo.ACTIVO,
      });
    }

    await this.depreciacionRepository.save(
      this.depreciacionRepository.create(registros),
    );

    // Asiento contable automático de depreciación — una línea débito/haber
    // por cada par de cuentas distinto que usaron las categorías afectadas.
    await this.asientosService.asientoDepreciacion(
      Array.from(desglosePorCuentas.values()),
      periodo,
      fechaFinStr,
      userId,
    );

    const totalDepreciacion = calculos.reduce((s, c) => s + c.dep, 0);
    this.logger.log(
      `Depreciación ${periodo} procesada: ${registros.length} activos, total: ${totalDepreciacion.toFixed(2)}`,
    );

    return {
      periodo,
      activosDepreciados: registros.length,
      totalDepreciacion: Number(totalDepreciacion.toFixed(2)),
    };
  }

  /** Panel de vista previa: calcula el asiento de depreciación SIN registrar nada (ni activos ni la corrida del período). */
  async previsualizarDepreciacion(periodo: string) {
    const { calculos, desglosePorCuentas } = await this.calcularDesgloseDepreciacion(periodo);
    if (calculos.length === 0) {
      return { ok: false, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: false, error: 'No hay activos que depreciar en este período (sin activos vigentes, ya totalmente depreciados, o adquiridos después del período).' };
    }
    return this.asientosService.previsualizarDepreciacion(Array.from(desglosePorCuentas.values()), periodo);
  }

  async getDepreciaciones(filtro: FiltroDepreciacionDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, activoId, periodo } = filtro;

    const qb = this.depreciacionRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.activo', 'activo')
      .where('d.empresaId = :eid', { eid: empresaId })
      .andWhere('d.isActive = :active', { active: true });

    if (activoId) qb.andWhere('d.activoId = :aid', { aid: activoId });
    if (periodo)  qb.andWhere('d.periodo = :per', { per: periodo });

    const [data, total] = await qb
      .orderBy('d.periodo', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getHistorialActivo(activoId: number) {
    await this.findActivoById(activoId);
    return this.depreciacionRepository.find({
      where: { activoId, isActive: true },
      order: { periodo: 'ASC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen y Reportes DGII
  // ──────────────────────────────────────────────────────────────────

  async getResumenActivos() {
    const empresaId = this.tenantService.getEmpresaId();
    const activos = await this.activoRepository.find({
      where: { isActive: true, empresaId },
      relations: ['categoria'],
    });

    const resumen = {
      totalActivos:     activos.filter((a) => a.estado === EstadoActivo.ACTIVO).length,
      totalDadosDeBaja: activos.filter((a) => a.estado !== EstadoActivo.ACTIVO).length,
      costoHistorico:   0,
      depAcumulada:     0,
      valorLibros:      0,
      porCategoria:     {} as Record<string, { cantidad: number; costo: number; depAcum: number; valorLibros: number }>,
    };

    for (const a of activos.filter((x) => x.isActive)) {
      const costo   = Number(a.costoAdquisicion);
      const depAcum = Number(a.depreciacionAcumulada);
      const libros  = Number(a.valorLibros);
      const cat     = a.categoria.nombre;

      resumen.costoHistorico += costo;
      resumen.depAcumulada   += depAcum;
      resumen.valorLibros    += libros;

      if (!resumen.porCategoria[cat]) {
        resumen.porCategoria[cat] = { cantidad: 0, costo: 0, depAcum: 0, valorLibros: 0 };
      }
      resumen.porCategoria[cat].cantidad++;
      resumen.porCategoria[cat].costo      += costo;
      resumen.porCategoria[cat].depAcum    += depAcum;
      resumen.porCategoria[cat].valorLibros += libros;
    }

    return {
      ...resumen,
      costoHistorico: Number(resumen.costoHistorico.toFixed(2)),
      depAcumulada:   Number(resumen.depAcumulada.toFixed(2)),
      valorLibros:    Number(resumen.valorLibros.toFixed(2)),
    };
  }

  async getReporteDGII(anio: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const activos = await this.activoRepository.find({
      where: { isActive: true, empresaId },
      relations: ['categoria'],
      order: { categoria: { codigo: 'ASC' }, codigo: 'ASC' },
    });

    const depPeriodo = await this.depreciacionRepository
      .createQueryBuilder('d')
      .select('d.activoId', 'activoId')
      .addSelect('COALESCE(SUM(d.montoDepreciacion), 0)', 'totalAnio')
      .where('d.isActive = true')
      .andWhere('d.empresaId = :eid', { eid: empresaId })
      .andWhere("d.periodo LIKE :pattern", { pattern: `${anio}-%` })
      .groupBy('d.activoId')
      .getRawMany<{ activoId: number; totalAnio: string }>();

    const mapaDep = new Map(depPeriodo.map((d) => [d.activoId, Number(d.totalAnio)]));

    return {
      titulo:  `Reporte de Activos Fijos DGII — Año ${anio}`,
      ley:     'Código Tributario RD — Ley 11-92, Art. 287',
      anio,
      activos: activos.map((a) => ({
        codigo:              a.codigo,
        descripcion:         a.descripcion,
        categoria:           a.categoria.nombre,
        tasaAnual:           `${a.categoria.tasaAnual}%`,
        metodo:              a.categoria.metodo,
        fechaAdquisicion:    a.fechaAdquisicion,
        costoHistorico:      Number(a.costoAdquisicion),
        depAcumuladaInicio:  Number(a.depreciacionAcumulada) - (mapaDep.get(a.id) ?? 0),
        depAnio:             mapaDep.get(a.id) ?? 0,
        depAcumuladaFin:     Number(a.depreciacionAcumulada),
        valorLibros:         Number(a.valorLibros),
        estado:              a.estado,
      })),
      totales: {
        costoHistorico: activos.reduce((s, a) => s + Number(a.costoAdquisicion), 0),
        depAnio:        [...mapaDep.values()].reduce((s, v) => s + v, 0),
        depAcumulada:   activos.reduce((s, a) => s + Number(a.depreciacionAcumulada), 0),
        valorLibros:    activos.reduce((s, a) => s + Number(a.valorLibros), 0),
      },
    };
  }
}
