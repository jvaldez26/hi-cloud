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
import { UpdateCuentaBancariaDto } from './dto/update-cuenta-bancaria.dto';
import {
  RegistrarDepositoDto,
  RegistrarRetiroDto,
  RegistrarTransferenciaDto,
  AjustarSaldoDto,
  RegistrarDepositoEfectivoDto,
} from './dto/registrar-movimiento.dto';
import { CreateConciliacionDto } from './dto/create-conciliacion.dto';
import { FiltroMovimientoDto, FiltroConciliacionDto } from './dto/filtro-tesoreria.dto';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { obtenerDatosUnificadosCuentasBancarias, etiquetaCuentaBancaria } from '../common/cuentas-bancarias/saldo-cuenta-bancaria.util';
import { CajaService } from '../caja/caja.service';
import { CategoriaRetiro } from '../caja/entities/retiro-caja.entity';
import { UserRole } from '../users/enums/user-role.enum';

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
    private asientosService:         AsientosAutomaticosService,
    private cajaService:             CajaService,
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

  /**
   * ATÓMICO — ver docs/deuda-tecnica-bancos-tesoreria.md, incidente
   * 2026-10-15 (empresa 53): un cobro de CxC real (cxc.service.ts,
   * `registrarMovimientoAutomatico().catch(err => logger.error(...))`)
   * subió el saldo de la cuenta, pero el INSERT del movimiento falló
   * después — como las dos escrituras no estaban en una transacción, el
   * saldo quedó en RD$24,000 más alto que su historial real, sin ningún
   * movimiento que lo explicara, y el error quedó solo en el log del
   * servidor (nadie lo vio). Con `cuentaRepository.manager.transaction`,
   * si el INSERT del movimiento falla, el UPDATE del saldo se revierte
   * también — el saldo de una cuenta nunca puede volver a adelantarse a su
   * propio historial.
   */
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
    const eid = this.eid;
    return this.cuentaRepository.manager.transaction(async (manager) => {
      const cuentaRepo = manager.getRepository(CuentaBancaria);
      const movRepo    = manager.getRepository(MovimientoBancario);

      const cuenta = await cuentaRepo.findOne({
        where: { id: cuentaId, isActive: true, isActiva: true, ...(eid ? { empresaId: eid } : {}) } as any,
      });
      if (!cuenta) throw new NotFoundException(`Cuenta bancaria #${cuentaId} no encontrada o inactiva`);

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

      await cuentaRepo.update(cuentaId, { saldo: saldoNuevo });

      const mov = movRepo.create({
        ...(eid ? { empresaId: eid } : {}),
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

      return movRepo.save(mov);
    });
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

    // Atómico por el mismo motivo que registrarMovimiento: si el INSERT del
    // movimiento de saldo inicial fallara después de crear la cuenta, no
    // debe quedar una cuenta con saldo > 0 y cero movimientos detrás.
    return this.cuentaRepository.manager.transaction(async (manager) => {
      const cuentaRepo = manager.getRepository(CuentaBancaria);
      const movRepo    = manager.getRepository(MovimientoBancario);

      const cuenta = cuentaRepo.create({
        ...dto,
        saldo: dto.saldoInicial ?? 0,
        ...(eid ? { empresaId: eid } : {}),
      });
      const saved = await cuentaRepo.save(cuenta);

      if ((dto.saldoInicial ?? 0) > 0) {
        const mov = movRepo.create({
          ...(eid ? { empresaId: eid } : {}),
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
        await movRepo.save(mov);
      }

      return saved;
    });
  }

  async getCuentas() {
    const empresaId = this.eid;
    const cuentas = await this.cuentaRepository.find({
      where: { isActive: true, empresaId } as any,
      order: { moneda: 'ASC', banco: 'ASC' },
    });
    // Mismo criterio que el widget de Inicio y "Cuentas Bancarias &
    // Conciliación" — ver saldo-cuenta-bancaria.util.ts.
    const datos = await obtenerDatosUnificadosCuentasBancarias(this.cuentaRepository.manager, empresaId);
    return cuentas.map(c => ({ ...c, saldoActual: datos.get(c.id)?.saldoActual ?? Number(c.saldo) }));
  }

  async findCuentaById(id: number) {
    const empresaId = this.eid;
    const c = await this.cuentaRepository.findOne({
      where: { id, isActive: true, empresaId } as any,
    });
    if (!c) throw new NotFoundException(`Cuenta #${id} no encontrada`);
    return c;
  }

  /**
   * Defensa en profundidad además del DTO (ver update-cuenta-bancaria.dto.ts):
   * arma el UPDATE a mano con solo los campos permitidos, nunca con el `dto`
   * completo — así ni un cambio futuro al DTO, ni una llamada interna que
   * salte el controller, pueden volver a filtrar `saldo`/`saldoInicial`.
   */
  async updateCuenta(id: number, dto: UpdateCuentaBancariaDto) {
    await this.findCuentaById(id);
    const { banco, numeroCuenta, tipoCuenta, moneda, descripcion } = dto;
    const cambios = Object.fromEntries(
      Object.entries({ banco, numeroCuenta, tipoCuenta, moneda, descripcion }).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cambios).length > 0) {
      await this.cuentaRepository.update(id, cambios);
    }
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
    const mov = await this.registrarMovimiento(
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
    const cuentaEsManual = !!dto.cuentaContrapartida;
    await this.asientosService.asientoMovimientoBancario(
      mov.id, dto.monto, dto.descripcion, true, dto.fecha, userId, dto.cuentaContrapartida, cuentaEsManual,
    ).catch(err => this.logger.error(`Error asiento depósito #${mov.id}: ${err?.message ?? err}`));
    return mov;
  }

  async registrarRetiro(dto: RegistrarRetiroDto, userId: number) {
    const mov = await this.registrarMovimiento(
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
    const cuentaEsManual = !!dto.cuentaContrapartida;
    await this.asientosService.asientoMovimientoBancario(
      mov.id, dto.monto, dto.descripcion, false, dto.fecha, userId, dto.cuentaContrapartida, cuentaEsManual,
    ).catch(err => this.logger.error(`Error asiento retiro #${mov.id}: ${err?.message ?? err}`));
    return mov;
  }

  /** Panel de vista previa: calcula el asiento de depósito/retiro SIN registrar el movimiento. */
  async previsualizarAsientoMovimiento(monto: number, descripcion: string, esDeposito: boolean, cuentaContrapartida?: string) {
    return this.asientosService.previsualizarMovimientoBancario(monto, descripcion || '(sin descripción)', esDeposito, cuentaContrapartida);
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

  /**
   * Única forma legítima de cambiar un saldo fuera de una operación normal
   * (depósito/retiro/transferencia/cobro/pago) — ver docs/deuda-tecnica-bancos-tesoreria.md,
   * incidente 2026-10-15. Pasa SIEMPRE por `registrarMovimiento` (mismo
   * saldoAnterior/saldoNuevo/userId que cualquier otro movimiento) y genera
   * su asiento contable — nunca un UPDATE directo a `cuentas_bancarias`.
   */
  async ajustarSaldo(dto: AjustarSaldoDto, userId: number) {
    if (!dto.monto) throw new BadRequestException('El ajuste debe tener un monto distinto de 0');

    const tipo = dto.monto > 0 ? TipoMovimientoBancario.DEPOSITO : TipoMovimientoBancario.RETIRO;
    const descripcion = `Ajuste de saldo: ${dto.motivo}`;
    const mov = await this.registrarMovimiento(
      dto.cuentaBancariaId, tipo, Math.abs(dto.monto), dto.fecha, descripcion,
      userId, OrigenMovimiento.AJUSTE,
    );

    await this.asientosService.asientoMovimientoBancario(
      mov.id, Math.abs(dto.monto), descripcion, dto.monto > 0, dto.fecha, userId, undefined, false,
    ).catch(err => this.logger.error(`Error asiento de ajuste #${mov.id}: ${err?.message ?? err}`));

    return mov;
  }

  /**
   * Efectivo que sale de una caja diaria abierta y entra a una cuenta
   * bancaria (depósito físico, con volante). Antes no existía ninguna
   * forma correcta de hacer esto: el cobro en efectivo de CxC #246
   * (empresa 53, 2026-10-15, RD$24,000) se posteó directo al banco como
   * si fuera un cobro bancario — nunca pasó por una caja, así que el
   * efectivo "desapareció" del cuadre del cajero sin que el banco subiera
   * por el motivo correcto.
   *
   * No es una sola transacción de base de datos (CajaService.registrarRetiro
   * y este registrarMovimiento corren cada uno en la suya, por bloqueo
   * pesimista sobre la caja) — si el lado bancario falla DESPUÉS de sacar
   * el efectivo de caja, se revierte (anula) el retiro automáticamente en
   * vez de dejar el efectivo "perdido en tránsito".
   */
  async registrarDepositoEfectivo(dto: RegistrarDepositoEfectivoDto, userId: number, usuarioNombre?: string) {
    const descripcion = `Depósito de efectivo a banco${dto.referencia ? ` — volante ${dto.referencia}` : ''}`;

    const retiro: any = await this.cajaService.registrarRetiro(
      dto.cajaId, dto.monto, descripcion, userId, usuarioNombre,
      CategoriaRetiro.DEPOSITO_BANCO, dto.cuentaBancariaId,
    );

    if (retiro.requiereAuth) {
      // El retiro quedó PENDIENTE de autorización — el efectivo todavía no
      // salió de caja, así que el banco no debe subir todavía. Cuando un
      // supervisor lo autorice, el movimiento bancario se registra desde
      // Tesorería a mano (POST /tesoreria/movimientos/deposito-efectivo con
      // el mismo cajaId, una vez autorizado) — no hay enganche automático.
      return { retiro, movimiento: null, pendienteAutorizacion: true };
    }

    try {
      const mov = await this.registrarMovimiento(
        dto.cuentaBancariaId, TipoMovimientoBancario.DEPOSITO, dto.monto,
        dto.fecha ?? fechaHoyRD(), descripcion, userId,
        OrigenMovimiento.DEPOSITO_EFECTIVO, retiro.id, dto.referencia,
      );

      await this.asientosService.asientoMovimientoBancario(
        mov.id, dto.monto, descripcion, true, dto.fecha ?? fechaHoyRD(), userId, undefined, false,
      ).catch(err => this.logger.error(`Error asiento de depósito de efectivo #${mov.id}: ${err?.message ?? err}`));

      return { retiro, movimiento: mov, pendienteAutorizacion: false };
    } catch (err) {
      await this.cajaService.anularRetiro(
        retiro.id,
        'Reversado automáticamente — el movimiento bancario correspondiente falló al registrarse',
        userId, usuarioNombre ?? 'sistema',
      ).catch(err2 => this.logger.error(
        `No se pudo compensar el retiro #${retiro.id} tras fallo bancario: ${(err2 as Error)?.message ?? err2}`,
      ));
      throw new BadRequestException(
        `No se pudo registrar el depósito en la cuenta bancaria: ${(err as Error).message}. El retiro de caja fue revertido — el efectivo sigue en caja.`,
      );
    }
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
        fechaHoyRD(),
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

    // Efectivo de cajas ABIERTAS — cierre ciego: solo ADMIN/CONTADOR lo ven
    // (ver CajaController 'caja/abiertas', misma regla). Antes el widget
    // mezclaba cuentas bancarias bajo un encabezado "Efectivo y Cuentas" sin
    // que hubiera ningún efectivo real ahí — un VENDEDOR nunca debe ver el
    // esperado de una caja abierta, ni la suya ni la de otro cajero.
    const rolEmpresa = this.tenantService.getRolEmpresa();
    const puedeVerEfectivo = rolEmpresa === UserRole.ADMIN || rolEmpresa === UserRole.CONTADOR;
    const cajasAbiertas = puedeVerEfectivo ? await this.cajaService.getCajasAbiertas() : [];
    const cajas = cajasAbiertas.map((c: any) => ({
      id: c.id,
      cajero: c.vendedorNombre ?? 'Sin asignar',
      sucursalId: c.sucursalId ?? null,
      efectivoEsperado: Number(c.efectivoEsperado ?? 0),
    }));
    const efectivoTotal = puedeVerEfectivo
      ? Number(cajas.reduce((sum: number, c: any) => sum + c.efectivoEsperado, 0).toFixed(2))
      : null;

    // Misma fórmula que "Cuentas Bancarias & Conciliación" (ver
    // saldo-cuenta-bancaria.util.ts) — antes este widget solo leía `c.saldo`
    // (la columna que mantiene ESTE módulo) y se veía en RD$0.00 cualquier
    // cuenta registrada desde Bancos, aunque tuviera saldo inicial real
    // (incidente 2026-10-15, empresa 53).
    const datosUnificados = await obtenerDatosUnificadosCuentasBancarias(this.cuentaRepository.manager, eid);
    const balanceTotal = cuentas.reduce((sum, c) => sum + (datosUnificados.get(c.id)?.saldoActual ?? Number(c.saldo)), 0);

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

    // Ventas y gastos del día desde facturas y gastos (actividad financiera real)
    const mgr = this.movimientoRepository.manager;

    const [factHoy, gastHoy, factSemana, gastSemana] = await Promise.all([
      mgr.query<any[]>(
        `SELECT CONCAT('Venta — ', f.folio) AS descripcion, f.total::float AS monto,
                'ingreso' AS tipo, f."createdAt" AS fecha,
                TO_CHAR(f."createdAt", 'HH24:MI') AS hora
         FROM facturas f
         WHERE f."empresaId" = $1 AND f."isActive" = true
           AND f.estado NOT IN ('borrador','cancelada')
           AND DATE(f."createdAt") = CURRENT_DATE
         ORDER BY f."createdAt" DESC LIMIT 20`, [eid],
      ),
      mgr.query<any[]>(
        `SELECT COALESCE(g.descripcion, 'Gasto') AS descripcion, g.total::float AS monto,
                'egreso' AS tipo, g."createdAt" AS fecha,
                TO_CHAR(g."createdAt", 'HH24:MI') AS hora
         FROM gastos g
         WHERE g."empresaId" = $1 AND g."isActive" = true
           AND DATE(g."createdAt") = CURRENT_DATE
         ORDER BY g."createdAt" DESC LIMIT 10`, [eid],
      ),
      mgr.query<any[]>(
        `SELECT CONCAT('Venta — ', f.folio) AS descripcion, f.total::float AS monto,
                'ingreso' AS tipo, f."createdAt" AS fecha, NULL AS hora
         FROM facturas f
         WHERE f."empresaId" = $1 AND f."isActive" = true
           AND f.estado NOT IN ('borrador','cancelada')
           AND DATE(f."createdAt") >= CURRENT_DATE - INTERVAL '7 days'
           AND DATE(f."createdAt") < CURRENT_DATE
         ORDER BY f."createdAt" DESC LIMIT 20`, [eid],
      ),
      mgr.query<any[]>(
        `SELECT COALESCE(g.descripcion, 'Gasto') AS descripcion, g.total::float AS monto,
                'egreso' AS tipo, g."createdAt" AS fecha, NULL AS hora
         FROM gastos g
         WHERE g."empresaId" = $1 AND g."isActive" = true
           AND DATE(g."createdAt") >= CURRENT_DATE - INTERVAL '7 days'
           AND DATE(g."createdAt") < CURRENT_DATE
         ORDER BY g."createdAt" DESC LIMIT 10`, [eid],
      ),
    ]).catch(() => [[], [], [], []]) as [any[], any[], any[], any[]];

    const sortByFecha = (a: any, b: any) =>
      new Date(b.fecha).getTime() - new Date(a.fecha).getTime();

    const actHoy    = [...movsHoy.map(toActividad),    ...factHoy,    ...gastHoy]   .sort(sortByFecha).slice(0, 20);
    const actSemana = [...movsSemana.map(toActividad), ...factSemana, ...gastSemana].sort(sortByFecha).slice(0, 20);

    return {
      // BANCOS — nunca mezclado con efectivo (ver `cajas` abajo, grupo aparte).
      cuentas: cuentas.map(c => {
        const datos = datosUnificados.get(c.id);
        return {
          id:     c.id,
          // Alias/titular + banco + últimos dígitos — nunca solo el banco
          // (requisito explícito: antes mostraba "SCOTIABANK" a secas).
          nombre: etiquetaCuentaBancaria({ nombre: datos?.nombre, banco: c.banco, numeroCuenta: datos?.numeroCuenta ?? c.numeroCuenta }),
          tipo:   c.tipoCuenta,
          saldo:  datos?.saldoActual ?? Number(c.saldo),
          moneda: c.moneda,
        };
      }),
      balanceTotal,
      // EFECTIVO — cajas ABIERTA, una línea por cajero. `null` (no []) para
      // VENDEDOR/VIEWER: el frontend debe poder distinguir "no tiene permiso
      // de verlo" de "no hay cajas abiertas" y ocultar el grupo entero, no
      // mostrarlo vacío ni en cero (cierre ciego).
      cajas: puedeVerEfectivo ? cajas : null,
      efectivoTotal,
      totalDisponible: puedeVerEfectivo ? Number((balanceTotal + (efectivoTotal ?? 0)).toFixed(2)) : null,
      actividad: {
        hoy:    actHoy,
        semana: actSemana,
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
