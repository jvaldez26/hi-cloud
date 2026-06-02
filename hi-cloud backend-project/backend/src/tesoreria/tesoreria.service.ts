import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaBancaria, Moneda } from './entities/cuenta-bancaria.entity';
import {
  MovimientoBancario,
  TipoMovimientoBancario,
  OrigenMovimiento,
  TIPOS_ENTRADA,
} from './entities/movimiento-bancario.entity';
import {
  ConciliacionBancaria,
  EstadoConciliacion,
} from './entities/conciliacion-bancaria.entity';
import { CreateCuentaBancariaDto } from './dto/create-cuenta-bancaria.dto';
import {
  RegistrarDepositoDto,
  RegistrarRetiroDto,
  RegistrarTransferenciaDto,
} from './dto/registrar-movimiento.dto';
import { CreateConciliacionDto } from './dto/create-conciliacion.dto';
import { FiltroMovimientoDto, FiltroConciliacionDto } from './dto/filtro-tesoreria.dto';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class TesoreriaService {
  private readonly logger = new Logger(TesoreriaService.name);

  constructor(
    @InjectRepository(CuentaBancaria)
    private cuentaRepository:        Repository<CuentaBancaria>,
    @InjectRepository(MovimientoBancario)
    private movimientoRepository:    Repository<MovimientoBancario>,
    @InjectRepository(ConciliacionBancaria)
    private conciliacionRepository:  Repository<ConciliacionBancaria>,
    private tenantService:           TenantService,
  ) {}

  private get eid(): number {
    return this.tenantService.getEmpresaId();
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  private async findCuentaActiva(id: number): Promise<CuentaBancaria> {
    const eid = this.eid;
    const c = await this.cuentaRepository.findOne({
      where: { id, isActive: true, isActiva: true, ...(eid ? { empresaId: eid } : {}) } as any,
    });
    if (!c) throw new NotFoundException(`Cuenta bancaria #${id} no encontrada o inactiva`);
    return c;
  }

  private async registrarMovimiento(
    cuentaId: number,
    tipo: TipoMovimientoBancario,
    monto: number,
    fecha: string,
    descripcion: string,
    userId: number,
    origen: OrigenMovimiento = OrigenMovimiento.MANUAL,
    origenId?: number,
    referencia?: string,
  ): Promise<MovimientoBancario> {
    const cuenta = await this.findCuentaActiva(cuentaId);
    const saldoAnterior = Number(cuenta.saldo);
    const esEntrada = TIPOS_ENTRADA.includes(tipo);
    const saldoNuevo = esEntrada
      ? Number((saldoAnterior + monto).toFixed(2))
      : Number((saldoAnterior - monto).toFixed(2));

    if (!esEntrada && saldoNuevo < 0) {
      throw new BadRequestException(
        `Saldo insuficiente. Disponible: ${saldoAnterior.toFixed(2)}, requerido: ${monto.toFixed(2)}`,
      );
    }

    await this.cuentaRepository.update(cuentaId, { saldo: saldoNuevo });

    const mov = this.movimientoRepository.create({
      ...(this.eid ? { empresaId: this.eid } : {}),
      cuentaBancariaId: cuentaId,
      tipo,
      monto,
      fecha: new Date(fecha),
      descripcion,
      referencia,
      origen,
      origenId,
      saldoAnterior,
      saldoNuevo,
      userId,
    });

    return this.movimientoRepository.save(mov);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cuentas Bancarias
  // ──────────────────────────────────────────────────────────────────

  async createCuenta(dto: CreateCuentaBancariaDto, userId: number) {
    const eid = this.eid;
    const existe = await this.cuentaRepository.findOne({
      where: { numeroCuenta: dto.numeroCuenta, ...(eid ? { empresaId: eid } : {}) } as any,
    });
    if (existe) throw new ConflictException(`Cuenta ${dto.numeroCuenta} ya registrada`);

    const cuenta = this.cuentaRepository.create({
      ...dto,
      saldo: dto.saldoInicial ?? 0,
      ...(eid ? { empresaId: eid } : {}),
    });

    const saved = await this.cuentaRepository.save(cuenta);

    // Registrar saldo inicial como depósito si > 0
    if ((dto.saldoInicial ?? 0) > 0) {
      const mov = this.movimientoRepository.create({
        cuentaBancariaId: saved.id,
        tipo:         TipoMovimientoBancario.DEPOSITO,
        monto:        dto.saldoInicial!,
        fecha:        new Date(),
        descripcion:  'Saldo inicial',
        origen:       OrigenMovimiento.MANUAL,
        saldoAnterior: 0,
        saldoNuevo:   dto.saldoInicial!,
        userId,
      });
      await this.movimientoRepository.save(mov);
    }

    return saved;
  }

  async getCuentas() {
    const empresaId = this.eid;
    return this.cuentaRepository.find({
      where: { isActive: true, empresaId } as any,
      order: { moneda: 'ASC', banco: 'ASC' },
    });
  }

  async findCuentaById(id: number) {
    const empresaId = this.eid;
    const c = await this.cuentaRepository.findOne({
      where: { id, isActive: true, empresaId } as any,
    });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return c;
  }

  async updateCuenta(id: number, dto: Partial<CreateCuentaBancariaDto>) {
    await this.findCuentaById(id);
    await this.cuentaRepository.update(id, dto);
    return this.findCuentaById(id);
  }

  async removeCuenta(id: number) {
    const c = await this.findCuentaById(id);
    if (Number(c.saldo) !== 0) {
      throw new BadRequestException('No se puede eliminar una cuenta con saldo diferente de 0');
    }
    await this.cuentaRepository.update(id, { isActive: false, isActiva: false });
    return { message: `Cuenta ${c.numeroCuenta} eliminada` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Movimientos Manuales
  // ──────────────────────────────────────────────────────────────────

  async registrarDeposito(dto: RegistrarDepositoDto, userId: number) {
    return this.registrarMovimiento(
      dto.cuentaBancariaId,
      TipoMovimientoBancario.DEPOSITO,
      dto.monto,
      dto.fecha,
      dto.descripcion,
      userId,
      OrigenMovimiento.MANUAL,
      undefined,
      dto.referencia,
    );
  }

  async registrarRetiro(dto: RegistrarRetiroDto, userId: number) {
    return this.registrarMovimiento(
      dto.cuentaBancariaId,
      TipoMovimientoBancario.RETIRO,
      dto.monto,
      dto.fecha,
      dto.descripcion,
      userId,
      OrigenMovimiento.MANUAL,
      undefined,
      dto.referencia,
    );
  }

  async registrarTransferencia(dto: RegistrarTransferenciaDto, userId: number) {
    if (dto.cuentaOrigenId === dto.cuentaDestinoId) {
      throw new BadRequestException('La cuenta origen y destino no pueden ser la misma');
    }

    const salida = await this.registrarMovimiento(
      dto.cuentaOrigenId,
      TipoMovimientoBancario.TRANSFERENCIA_SALIDA,
      dto.monto,
      dto.fecha,
      `Transferencia a cuenta #${dto.cuentaDestinoId}: ${dto.descripcion}`,
      userId,
      OrigenMovimiento.TRANSFERENCIA,
      undefined,
      dto.referencia,
    );

    await this.registrarMovimiento(
      dto.cuentaDestinoId,
      TipoMovimientoBancario.TRANSFERENCIA_ENTRADA,
      dto.monto,
      dto.fecha,
      `Transferencia desde cuenta #${dto.cuentaOrigenId}: ${dto.descripcion}`,
      userId,
      OrigenMovimiento.TRANSFERENCIA,
      salida.id,
      dto.referencia,
    );

    return { message: 'Transferencia registrada exitosamente', salida };
  }

  // ──────────────────────────────────────────────────────────────────
  // Integración automática (llamada desde CxC, CxP, Nómina)
  // ──────────────────────────────────────────────────────────────────

  async registrarMovimientoAutomatico(
    tipo: TipoMovimientoBancario,
    monto: number,
    descripcion: string,
    origen: OrigenMovimiento,
    origenId: number,
    userId: number,
    moneda: Moneda = Moneda.DOP,
  ): Promise<void> {
    const empresaId = this.eid;
    const cuenta = await this.cuentaRepository.findOne({
      where: { moneda, isActive: true, isActiva: true, empresaId } as any,
      order: { createdAt: 'ASC' },
    });

    if (!cuenta) {
      this.logger.warn(`Sin cuenta ${moneda} activa — movimiento automático omitido`);
      return;
    }

    try {
      await this.registrarMovimiento(
        cuenta.id,
        tipo,
        monto,
        new Date().toISOString().split('T')[0],
        descripcion,
        userId,
        origen,
        origenId,
      );
    } catch (err) {
      // Logueamos pero NO re-lanzamos: el movimiento bancario automático es un efecto secundario.
      // Si falla, la operación principal (cobro CxC, pago CxP, etc.) ya se completó.
      // El administrador puede registrar el movimiento manualmente desde Bancos.
      this.logger.error(
        `[TesoreriaService] Movimiento automático falló — origen=${origen} origenId=${origenId} ` +
        `monto=${monto} cuenta=${cuenta.id}: ${(err as Error).message}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Consulta de Movimientos
  // ──────────────────────────────────────────────────────────────────

  async getMovimientos(filtro: FiltroMovimientoDto) {
    const { limit = 10, page = 1, cuentaBancariaId, tipo, origen, fechaDesde, fechaHasta } = filtro;

    const empresaId = this.eid;
    const qb = this.movimientoRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.cuentaBancaria', 'cuenta')
      .where('m.isActive = :active AND cuenta.empresaId = :eid', { active: true, eid: empresaId });

    if (cuentaBancariaId) qb.andWhere('m.cuentaBancariaId = :cid', { cid: cuentaBancariaId });
    if (tipo)             qb.andWhere('m.tipo = :tipo', { tipo });
    if (origen)           qb.andWhere('m.origen = :origen', { origen });
    if (fechaDesde)       qb.andWhere('m.fecha >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta)       qb.andWhere('m.fecha <= :hasta', { hasta: new Date(fechaHasta) });

    const [data, total] = await qb
      .orderBy('m.fecha', 'DESC')
      .addOrderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ──────────────────────────────────────────────────────────────────
  // Conciliación Bancaria
  // ──────────────────────────────────────────────────────────────────

  async iniciarConciliacion(dto: CreateConciliacionDto, userId: number) {
    const cuenta = await this.findCuentaActiva(dto.cuentaBancariaId);

    const existe = await this.conciliacionRepository.findOne({
      where: {
        cuentaBancariaId: dto.cuentaBancariaId,
        periodo: dto.periodo,
        isActive: true,
      },
    });
    if (existe && existe.estado !== EstadoConciliacion.BORRADOR) {
      throw new ConflictException(`Ya existe una conciliación ${dto.periodo} para esta cuenta`);
    }

    const saldoSistema = Number(cuenta.saldo);
    const diferencia   = Number((dto.saldoExtracto - saldoSistema).toFixed(2));

    const pendientes = await this.movimientoRepository.count({
      where: {
        cuentaBancariaId: dto.cuentaBancariaId,
        conciliado: false,
        isActive: true,
      },
    });

    const eid = this.eid;
    const conc = this.conciliacionRepository.create({
      cuentaBancariaId:      dto.cuentaBancariaId,
      periodo:               dto.periodo,
      fechaInicio:           new Date(dto.fechaInicio),
      fechaFin:              new Date(dto.fechaFin),
      saldoExtracto:         dto.saldoExtracto,
      saldoSistema,
      diferencia,
      estado:                EstadoConciliacion.EN_PROCESO,
      movimientosPendientes: pendientes,
      notas:                 dto.notas,
      userId,
      ...(eid ? { empresaId: eid } : {}),
    });

    return this.conciliacionRepository.save(conc);
  }

  async getConciliaciones(filtro: FiltroConciliacionDto) {
    const { limit = 10, page = 1, cuentaBancariaId, estado } = filtro;

    const qb = this.conciliacionRepository
      .createQueryBuilder('c')
      .where('c.isActive = :active', { active: true });

    if (cuentaBancariaId) qb.andWhere('c.cuentaBancariaId = :cid', { cid: cuentaBancariaId });
    if (estado)           qb.andWhere('c.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('c.periodo', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findConciliacionById(id: number) {
    const c = await this.conciliacionRepository.findOne({
      where: { id, isActive: true },
      relations: ['cuentaBancaria', 'user'],
    });
    if (!c) throw new NotFoundException(`Conciliación #${id} no encontrada`);
    return c;
  }

  async conciliarMovimiento(conciliacionId: number, movimientoId: number) {
    const conc = await this.findConciliacionById(conciliacionId);
    if (conc.estado === EstadoConciliacion.CERRADA) {
      throw new BadRequestException('La conciliación está cerrada');
    }

    await this.movimientoRepository.update(movimientoId, {
      conciliado:         true,
      fechaConciliacion:  new Date(),
    });

    const pendientes = await this.movimientoRepository.count({
      where: {
        cuentaBancariaId: conc.cuentaBancariaId,
        conciliado: false,
        isActive: true,
      },
    });

    await this.conciliacionRepository.update(conciliacionId, {
      movimientosConciliados: conc.movimientosConciliados + 1,
      movimientosPendientes: pendientes,
    });

    return this.findConciliacionById(conciliacionId);
  }

  async cerrarConciliacion(id: number) {
    const conc = await this.findConciliacionById(id);

    if (Math.abs(conc.diferencia) > 0.01) {
      throw new BadRequestException(
        `No se puede cerrar. Diferencia pendiente: ${conc.diferencia.toFixed(2)}`,
      );
    }

    await this.conciliacionRepository.update(id, { estado: EstadoConciliacion.CERRADA });
    return this.findConciliacionById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Dashboard widget de Tesorería
  // ──────────────────────────────────────────────────────────────────

  async getDashboard() {
    const eid = this.eid;

    const cuentas = await this.cuentaRepository.find({
      where: { isActive: true, isActiva: true, empresaId: eid } as any,
      order: { moneda: 'ASC', banco: 'ASC' },
    });

    const balanceTotal = cuentas.reduce((sum, c) => sum + Number(c.saldo), 0);

    // Movimientos de hoy
    const movsHoy = await this.movimientoRepository
      .createQueryBuilder('m')
      .where('m.isActive = true')
      .andWhere('m.empresaId = :eid', { eid })
      .andWhere('DATE(m.fecha) = CURRENT_DATE')
      .orderBy('m.createdAt', 'DESC')
      .take(20)
      .getMany();

    // Movimientos de los últimos 7 días (sin incluir hoy)
    const movsSemana = await this.movimientoRepository
      .createQueryBuilder('m')
      .where('m.isActive = true')
      .andWhere('m.empresaId = :eid', { eid })
      .andWhere('DATE(m.fecha) >= CURRENT_DATE - INTERVAL \'7 days\'')
      .andWhere('DATE(m.fecha) < CURRENT_DATE')
      .orderBy('m.fecha', 'DESC')
      .take(20)
      .getMany();

    const toActividad = (m: MovimientoBancario) => ({
      descripcion: m.descripcion,
      monto:       Number(m.monto),
      tipo:        TIPOS_ENTRADA.includes(m.tipo) ? 'ingreso' : 'egreso',
      fecha:       m.fecha,
      hora:        (m as any).createdAt
        ? new Date((m as any).createdAt).toTimeString().slice(0, 5)
        : undefined,
    });

    return {
      cuentas: cuentas.map(c => ({
        id:     c.id,
        nombre: c.banco,
        tipo:   c.tipoCuenta,
        saldo:  Number(c.saldo),
        moneda: c.moneda,
      })),
      balanceTotal,
      actividad: {
        hoy:    movsHoy.map(toActividad),
        semana: movsSemana.map(toActividad),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Reportes de Tesorería
  // ──────────────────────────────────────────────────────────────────

  async getResumenTesoreria() {
    const cuentas = await this.getCuentas();

    const resumenPorMoneda: Record<string, number> = {};
    for (const c of cuentas) {
      resumenPorMoneda[c.moneda] = (resumenPorMoneda[c.moneda] ?? 0) + Number(c.saldo);
    }

    const totalDOP = resumenPorMoneda[Moneda.DOP] ?? 0;
    const totalUSD = resumenPorMoneda[Moneda.USD] ?? 0;

    const movimientosHoy = await this.movimientoRepository
      .createQueryBuilder('m')
      .select('m.tipo', 'tipo')
      .addSelect('COALESCE(SUM(m.monto), 0)', 'total')
      .where('m.isActive = true AND DATE(m.fecha) = CURRENT_DATE')
      .andWhere('m.empresaId = :eid', { eid: this.eid })
      .groupBy('m.tipo')
      .getRawMany<{ tipo: string; total: string }>();

    const entradasHoy = movimientosHoy
      .filter((r) => TIPOS_ENTRADA.includes(r.tipo as TipoMovimientoBancario))
      .reduce((a, r) => a + Number(r.total), 0);
    const salidasHoy = movimientosHoy
      .filter((r) => !TIPOS_ENTRADA.includes(r.tipo as TipoMovimientoBancario))
      .reduce((a, r) => a + Number(r.total), 0);

    return {
      cuentas,
      saldosPorMoneda: resumenPorMoneda,
      totalCuentasDOP:  totalDOP,
      totalCuentasUSD:  totalUSD,
      movimientosHoy:   { entradas: entradasHoy, salidas: salidasHoy, neto: entradasHoy - salidasHoy },
      generadoEn: new Date().toISOString(),
    };
  }

  async getFlujoCaja(fechaDesde: string, fechaHasta: string) {
    const rows = await this.movimientoRepository
      .createQueryBuilder('m')
      .select('m.origen', 'origen')
      .addSelect('m.tipo', 'tipo')
      .addSelect('COALESCE(SUM(m.monto), 0)', 'total')
      .addSelect('COUNT(m.id)', 'cantidad')
      .where('m.isActive = true AND m.fecha BETWEEN :desde AND :hasta', {
        desde: new Date(fechaDesde),
        hasta: new Date(fechaHasta),
      })
      .andWhere('m.empresaId = :eid', { eid: this.eid })
      .groupBy('m.origen, m.tipo')
      .getRawMany<{ origen: string; tipo: string; total: string; cantidad: string }>();

    let totalEntradas = 0;
    let totalSalidas  = 0;
    const detalle: Record<string, { entradas: number; salidas: number }> = {};

    for (const r of rows) {
      const esEntrada = TIPOS_ENTRADA.includes(r.tipo as TipoMovimientoBancario);
      const monto = Number(r.total);
      const cat = r.origen;
      if (!detalle[cat]) detalle[cat] = { entradas: 0, salidas: 0 };
      if (esEntrada) { detalle[cat].entradas += monto; totalEntradas += monto; }
      else           { detalle[cat].salidas  += monto; totalSalidas  += monto; }
    }

    // Saldo inicial: saldo al inicio del período
    const saldoInicial = await this.movimientoRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(CASE WHEN m.tipo IN (\'deposito\',\'transferencia_entrada\',\'nota_credito\',\'interes\') THEN m.monto ELSE -m.monto END), 0)', 'neto')
      .where('m.isActive = true AND m.fecha < :desde', { desde: new Date(fechaDesde) })
      .andWhere('m.empresaId = :eid', { eid: this.eid })
      .getRawOne<{ neto: string }>();

    const saldoInicialNum = Number(saldoInicial?.neto ?? 0);
    const flujoNeto = totalEntradas - totalSalidas;
    const saldoFinal = saldoInicialNum + flujoNeto;

    return {
      periodo: { fechaDesde, fechaHasta },
      saldoInicial:  Number(saldoInicialNum.toFixed(2)),
      entradas:      Number(totalEntradas.toFixed(2)),
      salidas:       Number(totalSalidas.toFixed(2)),
      flujoNeto:     Number(flujoNeto.toFixed(2)),
      saldoFinal:    Number(saldoFinal.toFixed(2)),
      detallePorOrigen: detalle,
    };
  }

  async getFlujoPorDia(mes: number, anio: number) {
    const rows = await this.movimientoRepository
      .createQueryBuilder('m')
      .select('EXTRACT(DAY FROM m.fecha)::int', 'dia')
      .addSelect(
        `COALESCE(SUM(CASE WHEN m.tipo IN ('deposito','transferencia_entrada','nota_credito','interes') THEN m.monto ELSE 0 END), 0)`,
        'entradas',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN m.tipo NOT IN ('deposito','transferencia_entrada','nota_credito','interes') THEN m.monto ELSE 0 END), 0)`,
        'salidas',
      )
      .where('m.isActive = true')
      .andWhere('EXTRACT(MONTH FROM m.fecha) = :mes', { mes })
      .andWhere('EXTRACT(YEAR FROM m.fecha) = :anio', { anio })
      .andWhere('m.empresaId = :eid', { eid: this.eid })
      .groupBy('EXTRACT(DAY FROM m.fecha)')
      .orderBy('dia', 'ASC')
      .getRawMany<{ dia: number; entradas: string; salidas: string }>();

    return {
      mes,
      anio,
      grafica: rows.map((r) => ({
        dia:      r.dia,
        entradas: Number(r.entradas),
        salidas:  Number(r.salidas),
        neto:     Number(r.entradas) - Number(r.salidas),
      })),
    };
  }
}
