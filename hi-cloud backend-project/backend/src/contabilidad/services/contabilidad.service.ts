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
  CuentaContable,
  TipoCuenta,
  NaturalezaCuenta,
} from '../entities/cuenta-contable.entity';
import {
  AsientoContable,
  EstadoAsiento,
} from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { CreateCuentaContableDto } from '../dto/create-cuenta-contable.dto';
import { UpdateCuentaContableDto } from '../dto/update-cuenta-contable.dto';
import { CreateAsientoDto } from '../dto/create-asiento.dto';
import { FiltroContabilidadDto } from '../dto/filtro-contabilidad.dto';
import { TenantService } from '../../tenant/tenant.service';

// ── Plan de Cuentas estándar dominicano ─────────────────────────────────────
interface SeedCuenta {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
  nivel: number;
  permiteMovimientos: boolean;
}

const D = NaturalezaCuenta.DEUDORA;
const A = NaturalezaCuenta.ACREEDORA;

const PLAN_CUENTAS: SeedCuenta[] = [
  // ── CLASE 1 — ACTIVOS ──────────────────────────────────────────────────────
  { codigo: '1',          nombre: 'ACTIVOS',                           tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '1.1',        nombre: 'Activo Corriente',                  tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '1.1.1',      nombre: 'Efectivo y Equivalentes',           tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.1.01',   nombre: 'Caja Chica',                        tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.1.02',   nombre: 'Caja General',                      tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.1.03',   nombre: 'Bancos',                            tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2',      nombre: 'Cuentas por Cobrar',                tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.2.01',   nombre: 'Clientes',                          tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.2.02',   nombre: 'Documentos por Cobrar',             tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.3',      nombre: 'Inventarios',                       tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.3.01',   nombre: 'Mercancías para la Venta',          tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.1.4',      nombre: 'Impuestos Anticipados',             tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.1.4.01',   nombre: 'ITBIS Crédito Fiscal (Compras)',    tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2',        nombre: 'Activo No Corriente',               tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '1.2.1',      nombre: 'Propiedades, Planta y Equipo',      tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '1.2.1.01',   nombre: 'Muebles y Enseres',                 tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.02',   nombre: 'Equipos de Cómputo',                tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '1.2.1.03',   nombre: 'Vehículos',                         tipo: TipoCuenta.ACTIVO,     naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── CLASE 2 — PASIVOS ──────────────────────────────────────────────────────
  { codigo: '2',          nombre: 'PASIVOS',                           tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '2.1',        nombre: 'Pasivo Corriente',                  tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '2.1.1',      nombre: 'Cuentas por Pagar Comerciales',     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.1.01',   nombre: 'Proveedores',                       tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2',      nombre: 'Impuestos por Pagar',               tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.2.01',   nombre: 'ITBIS por Pagar (Ventas)',          tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.02',   nombre: 'ISR por Pagar',                     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.2.03',   nombre: 'Retenciones por Pagar',             tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3',      nombre: 'Obligaciones Laborales',            tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '2.1.3.01',   nombre: 'Sueldos por Pagar',                 tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.1.3.02',   nombre: 'TSS por Pagar',                     tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '2.2',        nombre: 'Pasivo No Corriente',               tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '2.2.1.01',   nombre: 'Préstamos Bancarios LP',            tipo: TipoCuenta.PASIVO,     naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 3 — PATRIMONIO ───────────────────────────────────────────────────
  { codigo: '3',          nombre: 'PATRIMONIO',                        tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '3.1',        nombre: 'Capital Social',                    tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '3.1.1.01',   nombre: 'Capital Suscrito y Pagado',         tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2',        nombre: 'Resultados',                        tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '3.2.1.01',   nombre: 'Utilidades Acumuladas',             tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '3.2.1.02',   nombre: 'Resultado del Ejercicio',           tipo: TipoCuenta.PATRIMONIO, naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 4 — INGRESOS ─────────────────────────────────────────────────────
  { codigo: '4',          nombre: 'INGRESOS',                          tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 1, permiteMovimientos: false },
  { codigo: '4.1',        nombre: 'Ingresos Operacionales',            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '4.1.1',      nombre: 'Ventas',                            tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 3, permiteMovimientos: false },
  { codigo: '4.1.1.01',   nombre: 'Ventas de Bienes',                  tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.1.1.02',   nombre: 'Ventas de Servicios',               tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2',        nombre: 'Ingresos No Operacionales',         tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 2, permiteMovimientos: false },
  { codigo: '4.2.1.01',   nombre: 'Ingresos Financieros',              tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },
  { codigo: '4.2.1.02',   nombre: 'Otros Ingresos',                    tipo: TipoCuenta.INGRESO,    naturaleza: A, nivel: 4, permiteMovimientos: true },

  // ── CLASE 5 — COSTOS ───────────────────────────────────────────────────────
  { codigo: '5',          nombre: 'COSTOS',                            tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '5.1',        nombre: 'Costo de Ventas',                   tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '5.1.1.01',   nombre: 'Costo de Ventas de Bienes',         tipo: TipoCuenta.COSTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },

  // ── CLASE 6 — GASTOS ───────────────────────────────────────────────────────
  { codigo: '6',          nombre: 'GASTOS',                            tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 1, permiteMovimientos: false },
  { codigo: '6.1',        nombre: 'Gastos Operacionales',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 2, permiteMovimientos: false },
  { codigo: '6.1.1',      nombre: 'Gastos de Personal',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.1.01',   nombre: 'Sueldos y Salarios',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.02',   nombre: 'TSS Patronal',                      tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.1.03',   nombre: 'Bonificaciones y Comisiones',       tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2',      nombre: 'Gastos Generales y Administración', tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.2.01',   nombre: 'Alquiler de Local',                 tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.02',   nombre: 'Servicios Públicos',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.03',   nombre: 'Comunicaciones',                    tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.2.04',   nombre: 'Materiales de Oficina',             tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3',      nombre: 'Gastos Financieros',                tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 3, permiteMovimientos: false },
  { codigo: '6.1.3.01',   nombre: 'Intereses Bancarios',               tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
  { codigo: '6.1.3.02',   nombre: 'Comisiones Bancarias',              tipo: TipoCuenta.GASTO,      naturaleza: D, nivel: 4, permiteMovimientos: true },
];

@Injectable()
export class ContabilidadService implements OnModuleInit {
  private readonly logger = new Logger(ContabilidadService.name);

  constructor(
    @InjectRepository(CuentaContable)
    private cuentaRepository:  Repository<CuentaContable>,
    @InjectRepository(AsientoContable)
    private asientoRepository: Repository<AsientoContable>,
    @InjectRepository(AsientoLinea)
    private lineaRepository:   Repository<AsientoLinea>,
    private tenantService:     TenantService,
  ) {}

  private get eid(): number | undefined {
    try { return this.tenantService.getEmpresaId(); } catch { return undefined; }
  }

  /** Siembra el Plan de Cuentas dominicano para una empresa específica */
  async seedPlanCuentas(empresaId: number): Promise<void> {
    const total = await this.cuentaRepository.count({ where: { empresaId } as any });
    if (total > 0) return;

    for (let nivel = 1; nivel <= 4; nivel++) {
      for (const c of PLAN_CUENTAS.filter((x) => x.nivel === nivel)) {
        const codigoPadre = c.codigo.split('.').slice(0, -1).join('.');
        let cuentaPadreId: number | undefined;
        if (codigoPadre) {
          const padre = await this.cuentaRepository.findOne({ where: { codigo: codigoPadre, empresaId } as any });
          cuentaPadreId = padre?.id;
        }
        await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...c, empresaId, cuentaPadreId }),
        );
      }
    }
    this.logger.log(`Plan de Cuentas sembrado para empresa ${empresaId}: ${PLAN_CUENTAS.length} cuentas`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Seed — Plan de Cuentas dominicano
  // ──────────────────────────────────────────────────────────────────

  async onModuleInit() {
    // El seed ahora es por empresa — se llama desde multi-empresa.service al crear empresa
    // Este método legacy se mantiene para empresas existentes sin COA
    const total = await this.cuentaRepository.count();
    if (total > 0) return;

    // Insertar por niveles para respetar la FK padre→hijo (solo si no hay ninguna cuenta)
    for (let nivel = 1; nivel <= 4; nivel++) {
      for (const c of PLAN_CUENTAS.filter((x) => x.nivel === nivel)) {
        const codigoPadre = c.codigo.split('.').slice(0, -1).join('.');
        let cuentaPadreId: number | undefined;

        if (codigoPadre) {
          const padre = await this.cuentaRepository.findOne({
            where: { codigo: codigoPadre },
          });
          cuentaPadreId = padre?.id;
        }

        await this.cuentaRepository.save(
          this.cuentaRepository.create({ ...c, cuentaPadreId }),
        );
      }
    }

    this.logger.log(`Plan de Cuentas dominicano sembrado: ${PLAN_CUENTAS.length} cuentas`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Plan de Cuentas — CRUD
  // ──────────────────────────────────────────────────────────────────

  async getCuentas(soloMovimientos = false) {
    const where: Record<string, unknown> = { isActive: true };
    if (soloMovimientos) where['permiteMovimientos'] = true;
    if (this.eid) where['empresaId'] = this.eid;
    return this.cuentaRepository.find({ where, order: { codigo: 'ASC' } });
  }

  async findCuentaById(id: number) {
    const where: any = { id, isActive: true };
    if (this.eid) where.empresaId = this.eid;
    const c = await this.cuentaRepository.findOne({ where });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return c;
  }

  async createCuenta(dto: CreateCuentaContableDto) {
    const where: any = { codigo: dto.codigo };
    if (this.eid) where.empresaId = this.eid;
    const existe = await this.cuentaRepository.findOne({ where });
    if (existe) throw new ConflictException(`Código ${dto.codigo} ya existe`);
    const eid = this.eid;
    return this.cuentaRepository.save(this.cuentaRepository.create({ ...dto, ...(eid ? { empresaId: eid } : {}) }));
  }

  async updateCuenta(id: number, dto: UpdateCuentaContableDto) {
    await this.findCuentaById(id);
    await this.cuentaRepository.update(id, dto);
    return this.findCuentaById(id);
  }

  async removeCuenta(id: number) {
    const c = await this.findCuentaById(id);
    const tieneLineas = await this.lineaRepository.count({ where: { cuentaContableId: id } });
    if (tieneLineas > 0) throw new BadRequestException('No se puede eliminar una cuenta con movimientos');
    await this.cuentaRepository.update(id, { isActive: false });
    return { message: `Cuenta "${c.nombre}" eliminada` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Asientos — CRUD
  // ──────────────────────────────────────────────────────────────────

  private async generarNumero(empresaId?: number): Promise<string> {
    const qb = this.asientoRepository.createQueryBuilder('a')
      .select(`MAX(CASE WHEN a.numero ~ '^ASI-[0-9]+$' THEN CAST(SUBSTRING(a.numero FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('a.isActive = :active', { active: true });
    if (empresaId) qb.andWhere('a.empresaId = :eid', { eid: empresaId });
    const res = await qb.getRawOne<{ maxNum: number | null }>();
    return `ASI-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  async createAsiento(dto: CreateAsientoDto, userId: number) {
    const totalDebe  = dto.lineas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = dto.lineas.reduce((s, l) => s + l.haber, 0);

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new BadRequestException(
        `El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}`,
      );
    }

    for (const linea of dto.lineas) {
      const cuenta = await this.cuentaRepository.findOne({
        where: { id: linea.cuentaContableId, isActive: true },
      });
      if (!cuenta) throw new NotFoundException(`Cuenta #${linea.cuentaContableId} no encontrada`);
      if (!cuenta.permiteMovimientos) {
        throw new BadRequestException(`La cuenta "${cuenta.nombre}" no permite movimientos directos`);
      }
    }

    const numero  = await this.generarNumero(this.eid);
    const asiento = this.asientoRepository.create({
      numero,
      fecha:         new Date(dto.fecha),
      descripcion:   dto.descripcion,
      referenciaFolio: dto.referenciaFolio,
      totalDebe:     Number(totalDebe.toFixed(2)),
      totalHaber:    Number(totalHaber.toFixed(2)),
      estado:        EstadoAsiento.BORRADOR,
      userId,
    });

    const saved = await this.asientoRepository.save(asiento);

    const lineas = this.lineaRepository.create(
      dto.lineas.map((l) => ({ ...l, asientoId: saved.id })),
    );
    await this.lineaRepository.save(lineas);

    return this.findAsientoById(saved.id);
  }

  async getAsientos(filtro: FiltroContabilidadDto) {
    const { limit = 10, page = 1, fechaDesde, fechaHasta, tipoOrigen, estado } = filtro;

    const qb = this.asientoRepository
      .createQueryBuilder('a')
      .where('a.isActive = :active', { active: true });

    const eid = this.eid;
    if (eid) qb.andWhere('a.empresaId = :eid', { eid });
    if (fechaDesde) qb.andWhere('a.fecha >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('a.fecha <= :hasta', { hasta: new Date(fechaHasta) });
    if (tipoOrigen) qb.andWhere('a.tipoOrigen = :tipo', { tipo: tipoOrigen });
    if (estado)     qb.andWhere('a.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('a.fecha', 'DESC')
      .addOrderBy('a.numero', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findAsientoById(id: number) {
    const a = await this.asientoRepository.findOne({
      where: { id, isActive: true },
      relations: ['lineas', 'lineas.cuentaContable', 'user'],
    });
    if (!a) throw new NotFoundException(`Asiento #${id} no encontrado`);
    return a;
  }

  async contabilizar(id: number) {
    const asiento = await this.findAsientoById(id);
    if (asiento.estado !== EstadoAsiento.BORRADOR) {
      throw new BadRequestException(`Solo se pueden contabilizar asientos en estado BORRADOR`);
    }
    await this.asientoRepository.update(id, { estado: EstadoAsiento.CONTABILIZADO });
    return this.findAsientoById(id);
  }

  async anularAsiento(id: number) {
    const asiento = await this.findAsientoById(id);
    if (asiento.estado === EstadoAsiento.ANULADO) {
      throw new BadRequestException('El asiento ya está anulado');
    }
    await this.asientoRepository.update(id, { estado: EstadoAsiento.ANULADO });
    return this.findAsientoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Libros y Estados Financieros
  // ──────────────────────────────────────────────────────────────────

  async getBalanceComprobacion(fechaDesde?: string, fechaHasta?: string) {
    const empresaId = this.eid;
    const cuentas = await this.cuentaRepository.find({
      where: { isActive: true, permiteMovimientos: true, ...(empresaId && { empresaId }) } as any,
      order: { codigo: 'ASC' },
    });

    const fechaFiltroDesde = fechaDesde ? `AND a.fecha >= '${fechaDesde}'` : '';
    const fechaFiltroHasta = fechaHasta ? `AND a.fecha <= '${fechaHasta}'` : '';
    const empresaFiltro    = empresaId  ? `AND a."empresaId" = ${empresaId}` : '';

    const saldos = await this.lineaRepository.query(
      `SELECT l."cuentaContableId",
              COALESCE(SUM(l.debe),  0) AS "totalDebe",
              COALESCE(SUM(l.haber), 0) AS "totalHaber"
       FROM asiento_lineas l
       JOIN asientos_contables a ON a.id = l."asientoId"
       WHERE a.estado = 'contabilizado'
         AND a."isActive" = true
         AND l."isActive" = true
         ${fechaFiltroDesde} ${fechaFiltroHasta}
         ${empresaFiltro}
       GROUP BY l."cuentaContableId"`,
    ) as { cuentaContableId: number; totalDebe: string; totalHaber: string }[];

    const mapaS = new Map(saldos.map((s) => [s.cuentaContableId, s]));

    const resultado = cuentas
      .map((c) => {
        const s = mapaS.get(c.id);
        const debe  = Number(s?.totalDebe  ?? 0);
        const haber = Number(s?.totalHaber ?? 0);
        return {
          codigo:   c.codigo,
          nombre:   c.nombre,
          tipo:     c.tipo,
          totalDebe:  debe,
          totalHaber: haber,
          saldo:    c.naturaleza === NaturalezaCuenta.DEUDORA ? debe - haber : haber - debe,
        };
      })
      .filter((r) => r.totalDebe > 0 || r.totalHaber > 0);

    return {
      periodo:      { fechaDesde: fechaDesde ?? 'inicio', fechaHasta: fechaHasta ?? 'hoy' },
      cuentas:      resultado,
      totales: {
        debe:  resultado.reduce((a, r) => a + r.totalDebe,  0),
        haber: resultado.reduce((a, r) => a + r.totalHaber, 0),
      },
    };
  }

  async getBalanceGeneral(fechaHasta?: string) {
    const bc = await this.getBalanceComprobacion(undefined, fechaHasta);
    const { cuentas } = bc;

    const activos    = cuentas.filter((c) => c.tipo === TipoCuenta.ACTIVO);
    const pasivos    = cuentas.filter((c) => c.tipo === TipoCuenta.PASIVO);
    const patrimonio = cuentas.filter((c) => c.tipo === TipoCuenta.PATRIMONIO);

    const totalActivos    = activos.reduce((a, c) => a + c.saldo, 0);
    const totalPasivos    = pasivos.reduce((a, c) => a + c.saldo, 0);
    const totalPatrimonio = patrimonio.reduce((a, c) => a + c.saldo, 0);

    return {
      fecha:   fechaHasta ?? new Date().toISOString().split('T')[0],
      activos: { detalle: activos,    total: totalActivos },
      pasivos: { detalle: pasivos,    total: totalPasivos },
      patrimonio: { detalle: patrimonio, total: totalPatrimonio },
      ecuacion: {
        activos:                totalActivos,
        pasivosYPatrimonio:     totalPasivos + totalPatrimonio,
        cuadra:                 Math.abs(totalActivos - (totalPasivos + totalPatrimonio)) < 0.01,
      },
    };
  }

  async getEstadoResultados(fechaDesde?: string, fechaHasta?: string) {
    const bc = await this.getBalanceComprobacion(fechaDesde, fechaHasta);
    const { cuentas } = bc;

    const ingresos = cuentas.filter((c) => c.tipo === TipoCuenta.INGRESO);
    const costos   = cuentas.filter((c) => c.tipo === TipoCuenta.COSTO);
    const gastos   = cuentas.filter((c) => c.tipo === TipoCuenta.GASTO);

    const totalIngresos  = ingresos.reduce((a, c) => a + c.saldo, 0);
    const totalCostos    = costos.reduce((a, c)   => a + c.saldo, 0);
    const totalGastos    = gastos.reduce((a, c)   => a + c.saldo, 0);
    const utilidadBruta  = totalIngresos - totalCostos;
    const utilidadNeta   = utilidadBruta - totalGastos;

    return {
      periodo:     { fechaDesde: fechaDesde ?? 'inicio', fechaHasta: fechaHasta ?? 'hoy' },
      ingresos:    { detalle: ingresos,  total: totalIngresos },
      costos:      { detalle: costos,    total: totalCostos },
      gastos:      { detalle: gastos,    total: totalGastos },
      utilidadBruta:  Number(utilidadBruta.toFixed(2)),
      totalGastos:    Number(totalGastos.toFixed(2)),
      utilidadNeta:   Number(utilidadNeta.toFixed(2)),
      situacion:   utilidadNeta >= 0 ? 'UTILIDAD' : 'PÉRDIDA',
    };
  }

  async getLibroDiario(filtro: FiltroContabilidadDto) {
    const asientos = await this.getAsientos({
      ...filtro,
      estado: EstadoAsiento.CONTABILIZADO,
    });
    return asientos;
  }

  async getLibroMayor(cuentaId: number, fechaDesde?: string, fechaHasta?: string) {
    const cuenta = await this.findCuentaById(cuentaId);

    const qb = this.lineaRepository
      .createQueryBuilder('l')
      .innerJoin('l.asiento', 'a', 'a.estado = :est AND a.isActive = true', {
        est: EstadoAsiento.CONTABILIZADO,
      })
      .select(['l.id', 'l.descripcion', 'l.debe', 'l.haber', 'a.fecha', 'a.numero', 'a.descripcion'])
      .addSelect('a.fecha', 'fecha')
      .addSelect('a.numero', 'asientoNumero')
      .where('l.cuentaContableId = :id AND l.isActive = true', { id: cuentaId });

    if (fechaDesde) qb.andWhere('a.fecha >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('a.fecha <= :hasta', { hasta: new Date(fechaHasta) });

    const lineas = await qb.orderBy('a.fecha', 'ASC').getMany();

    let saldoAcumulado = 0;
    const movimientos = lineas.map((l) => {
      const diff = cuenta.naturaleza === NaturalezaCuenta.DEUDORA
        ? Number(l.debe) - Number(l.haber)
        : Number(l.haber) - Number(l.debe);
      saldoAcumulado += diff;
      return {
        descripcion: l.descripcion,
        debe:        Number(l.debe),
        haber:       Number(l.haber),
        saldo:       Number(saldoAcumulado.toFixed(2)),
      };
    });

    return {
      cuenta: { codigo: cuenta.codigo, nombre: cuenta.nombre, tipo: cuenta.tipo },
      movimientos,
      saldoFinal: Number(saldoAcumulado.toFixed(2)),
    };
  }
}
