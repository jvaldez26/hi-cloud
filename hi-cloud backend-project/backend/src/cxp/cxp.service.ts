import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { CuentaPorPagar } from './entities/cuenta-por-pagar.entity';
import { PagoRealizado } from './entities/pago-realizado.entity';
import { Compra, CompraEstado } from '../compras/entities/compra.entity';
import { RegistrarPagoRealizadoDto } from './dto/registrar-pago-realizado.dto';
import { FiltroCuentasDto } from '../common/dto/filtro-cuentas.dto';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class CxPService {
  private readonly logger = new Logger(CxPService.name);

  constructor(
    @InjectRepository(CuentaPorPagar)
    private cxpRepository: Repository<CuentaPorPagar>,
    @InjectRepository(PagoRealizado)
    private pagoRepository: Repository<PagoRealizado>,
    @InjectRepository(Compra)
    private compraRepository: Repository<Compra>,
    private asientosService:  AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private realtimeService:  RealtimeService,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Creación automática al recibir compra
  // ──────────────────────────────────────────────────────────────────

  async crear(compraId: number, userId: number, diasVencimiento = 30): Promise<CuentaPorPagar> {
    const compra = await this.compraRepository.findOne({ where: { id: compraId } });
    if (!compra) throw new NotFoundException(`Compra #${compraId} no encontrada`);

    const yaExiste = await this.cxpRepository.findOne({ where: { compraId } });
    if (yaExiste) return yaExiste;

    const fechaEmision = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVencimiento);

    const cxp = this.cxpRepository.create({
      compraId,
      proveedorId:    compra.proveedorId,
      empresaId:      (compra as any).empresaId,
      montoOriginal:  Number(compra.total),
      montoPagado:    0,
      montoPendiente: Number(compra.total),
      fechaEmision,
      fechaVencimiento,
      diasVencimiento,
      userId,
      moneda:    (compra as any).moneda    ?? 'DOP',
      tipoCambio: Number((compra as any).tipoCambio ?? 1),
    });

    return this.cxpRepository.save(cxp);
  }

  // ──────────────────────────────────────────────────────────────────
  // Registro de pagos
  // ──────────────────────────────────────────────────────────────────

  async registrarPago(id: number, dto: RegistrarPagoRealizadoDto, userId: number) {
    const cuenta = await this.findById(id);

    if (cuenta.estado === EstadoCuenta.PAGADA || cuenta.estado === EstadoCuenta.ANULADA) {
      throw new BadRequestException(
        `La cuenta está "${cuenta.estado}" y no acepta más pagos`,
      );
    }

    const pendiente = Number(cuenta.montoPendiente);
    if (dto.monto > pendiente) {
      throw new BadRequestException(
        `Monto ${dto.monto} supera el pendiente ${pendiente.toFixed(2)}`,
      );
    }

    const nuevoPagado    = Number((Number(cuenta.montoPagado) + dto.monto).toFixed(2));
    const nuevoPendiente = Number((Number(cuenta.montoOriginal) - nuevoPagado).toFixed(2));
    const nuevoEstado    = nuevoPendiente <= 0 ? EstadoCuenta.PAGADA : EstadoCuenta.PAGADA_PARCIAL;

    const moneda   = (cuenta as any).moneda    ?? 'DOP';
    const tasaOrig = Number((cuenta as any).tipoCambio ?? 1);
    const tasaHoy  = Number(dto.tipoCambio ?? tasaOrig);
    const montoDOP = moneda !== 'DOP' ? parseFloat((dto.monto * tasaHoy).toFixed(2)) : dto.monto;

    const pago = this.pagoRepository.create({
      cuentaPorPagarId: id,
      monto:       dto.monto,
      fecha:       dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
      metodoPago:  dto.metodoPago,
      referencia:  dto.referencia,
      notas:       dto.notas,
      userId,
      moneda,
      tipoCambio: tasaHoy,
    });
    await this.pagoRepository.save(pago);

    await this.cxpRepository.update(id, {
      montoPagado:    nuevoPagado,
      montoPendiente: nuevoPendiente,
      estado:         nuevoEstado,
    });

    if (nuevoEstado === EstadoCuenta.PAGADA) {
      await this.compraRepository.update(cuenta.compraId, {
        estado: CompraEstado.PAGADA,
      });
      this.logger.log(`Compra #${cuenta.compraId} marcada como PAGADA`);
    }

    // Asiento contable: Proveedores / Bancos (con diferencia cambiaria si aplica)
    if (moneda !== 'DOP') {
      await this.asientosService.asientoPagoME(dto.monto, moneda, tasaHoy, tasaOrig, id, userId).catch(err =>
        this.logger.error(`Error asiento pago ME CxP #${id}: ${err?.message ?? err}`),
      );
    } else {
      await this.asientosService.asientoPago(dto.monto, id, userId).catch(err =>
        this.logger.error(`Error asiento pago CxP #${id}: ${err?.message ?? err}`),
      );
    }

    // Retiro bancario automático (montoDOP para tesorería)
    await this.tesoreriaService.registrarMovimientoAutomatico(
      TipoMovimientoBancario.RETIRO,
      montoDOP,
      `Pago CxP #${id} — ${dto.referencia ?? dto.metodoPago}`,
      OrigenMovimiento.PAGO_CXP,
      id,
      userId,
    ).catch(err =>
      this.logger.error(`Error tesorería pago CxP #${id}: ${err?.message ?? err}`),
    );

    const cuentaFinal = await this.findById(id);
    const eid = (cuentaFinal as any).empresaId;
    if (eid) this.realtimeService.notify(eid, 'cxc', 'updated', id);
    return cuentaFinal;
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────────────

  async getCuentas(filtro: FiltroCuentasDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, estado, fechaDesde, fechaHasta } = filtro;

    const qb = this.cxpRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'proveedor')
      .leftJoinAndSelect('c.compra', 'compra')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (estado)     qb.andWhere('c.estado = :estado', { estado });
    if (fechaDesde) qb.andWhere('c.fechaVencimiento >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('c.fechaVencimiento <= :hasta', { hasta: new Date(fechaHasta) });

    const [data, total] = await qb
      .orderBy('c.fechaVencimiento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cuenta = await this.cxpRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['proveedor', 'compra', 'user'],
    });
    if (!cuenta) throw new NotFoundException(`CxP #${id} no encontrada`);
    return cuenta;
  }

  async getPagos(cuentaId: number) {
    await this.findById(cuentaId);
    return this.pagoRepository.find({
      where: { cuentaPorPagarId: cuentaId, isActive: true },
      relations: ['user'],
      order: { fecha: 'DESC' },
    });
  }

  async getCuentasVencidas() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.cxpRepository.find({
      where: {
        empresaId,
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      relations: ['proveedor', 'compra'],
      order: { fechaVencimiento: 'ASC' },
    });
  }

  async getCuentasPorProveedor(proveedorId: number, filtro: FiltroCuentasDto) {
    const { limit = 20, page = 1, estado } = filtro;
    const empresaId = this.tenantService.getEmpresaId();

    const qb = this.cxpRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.compra', 'compra')
      .where('c.proveedorId = :proveedorId AND c.empresaId = :eid AND c.isActive = true', { proveedorId, eid: empresaId });

    if (estado) qb.andWhere('c.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('c.fechaVencimiento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getResumenPagos() {
    const empresaId = this.tenantService.getEmpresaId();
    const hoy = new Date();
    const en30 = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [porPagar, vencido, porVencer, pagadoMes] = await Promise.all([
      this.cxpRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado NOT IN (:...exc)', {
          eid: empresaId, exc: [EstadoCuenta.PAGADA, EstadoCuenta.ANULADA],
        })
        .getRawOne<{ total: string }>(),

      this.cxpRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado = :e', { eid: empresaId, e: EstadoCuenta.VENCIDA })
        .getRawOne<{ total: string }>(),

      this.cxpRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.empresaId = :eid AND c.estado IN (:...ests)', {
          eid: empresaId, ests: [EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL],
        })
        .andWhere('c.fechaVencimiento BETWEEN :hoy AND :en30', { hoy, en30 })
        .getRawOne<{ total: string }>(),

      this.pagoRepository.createQueryBuilder('p')
        .innerJoin('p.cuentaPorPagar', 'cxp')
        .select('COALESCE(SUM(p.monto), 0)', 'total')
        .where('p.isActive = true AND cxp.empresaId = :eid AND p.fecha >= :inicio', { eid: empresaId, inicio: inicioMes })
        .getRawOne<{ total: string }>(),
    ]);

    const cuenta = await this.cxpRepository.count({
      where: { isActive: true, empresaId } as any,
    });

    return {
      totalCuentas:    cuenta,
      totalPorPagar:   Number(porPagar?.total ?? 0),
      totalVencido:    Number(vencido?.total ?? 0),
      totalPorVencer30: Number(porVencer?.total ?? 0),
      pagadoEsteMes:   Number(pagadoMes?.total ?? 0),
      generadoEn: new Date().toISOString(),
    };
  }

  async anular(id: number) {
    const cuenta = await this.findById(id);

    if (cuenta.estado === EstadoCuenta.PAGADA || cuenta.estado === EstadoCuenta.ANULADA) {
      throw new BadRequestException(
        `No se puede anular una cuenta en estado "${cuenta.estado}"`,
      );
    }

    await this.cxpRepository.update(id, { estado: EstadoCuenta.ANULADA });
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron jobs
  // ──────────────────────────────────────────────────────────────────

  @Cron('1 0 * * *')
  async actualizarEstadosVencidos() {
    const resultado = await this.cxpRepository.update(
      {
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: EstadoCuenta.VENCIDA },
    );
    this.logger.log(`CxP vencidas actualizadas: ${resultado.affected ?? 0}`);
  }
}
