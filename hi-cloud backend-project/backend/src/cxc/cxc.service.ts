import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { CuentaPorCobrar } from './entities/cuenta-por-cobrar.entity';
import { PagoCobrado } from './entities/pago-cobrado.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { RegistrarPagoCobradoDto } from './dto/registrar-pago-cobrado.dto';
import { FiltroCuentasDto } from '../common/dto/filtro-cuentas.dto';
import { EstadoCuenta } from '../common/enums/estado-cuenta.enum';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class CxCService {
  private readonly logger = new Logger(CxCService.name);

  constructor(
    @InjectRepository(CuentaPorCobrar)
    private cxcRepository: Repository<CuentaPorCobrar>,
    @InjectRepository(PagoCobrado)
    private pagoRepository: Repository<PagoCobrado>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    private asientosService:  AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private dataSource:       DataSource,
    private realtimeService:  RealtimeService,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Creación automática al emitir factura
  // ──────────────────────────────────────────────────────────────────

  async crear(facturaId: number, userId: number, diasVencimiento = 30): Promise<CuentaPorCobrar> {
    const factura = await this.facturaRepository.findOne({ where: { id: facturaId } });
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);

    const yaExiste = await this.cxcRepository.findOne({ where: { facturaId } });
    if (yaExiste) return yaExiste;

    const fechaEmision = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasVencimiento);

    const cxc = this.cxcRepository.create({
      facturaId,
      clienteId: factura.clienteId,
      empresaId:  (factura as any).empresaId,
      montoOriginal:  Number(factura.total),
      montoPagado:    0,
      montoPendiente: Number(factura.total),
      fechaEmision,
      fechaVencimiento,
      diasVencimiento,
      userId,
    });

    return this.cxcRepository.save(cxc);
  }

  // ──────────────────────────────────────────────────────────────────
  // Registro de cobros
  // ──────────────────────────────────────────────────────────────────

  async registrarPago(id: number, dto: RegistrarPagoCobradoDto, userId: number) {
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

    // Transacción atómica: pago + actualización CxC + factura en una sola operación
    await this.dataSource.transaction(async (em) => {
      const pagoRepo  = em.getRepository(PagoCobrado);
      const cxcRepo   = em.getRepository(CuentaPorCobrar);
      const factRepo  = em.getRepository(Factura);

      await pagoRepo.save(pagoRepo.create({
        cuentaPorCobrarId: id,
        monto:       dto.monto,
        fecha:       dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
        metodoPago:  dto.metodoPago,
        referencia:  dto.referencia,
        notas:       dto.notas,
        userId,
      }));

      await cxcRepo.update(id, {
        montoPagado:    nuevoPagado,
        montoPendiente: nuevoPendiente,
        estado:         nuevoEstado,
      });

      if (nuevoEstado === EstadoCuenta.PAGADA) {
        await factRepo.update(cuenta.facturaId, { estado: FacturaEstado.PAGADA });
        this.logger.log(`Factura #${cuenta.facturaId} marcada como PAGADA`);
      }
    });

    // Asiento contable y tesorería (fuera de la transacción DB, son efectos secundarios)
    await this.asientosService.asientoCobro(dto.monto, id, userId).catch(err =>
      this.logger.error(`Error asiento cobro CxC #${id}: ${err.message}`),
    );
    await this.tesoreriaService.registrarMovimientoAutomatico(
      TipoMovimientoBancario.DEPOSITO,
      dto.monto,
      `Cobro CxC #${id} — ${dto.referencia ?? dto.metodoPago}`,
      OrigenMovimiento.COBRO_CXC,
      id,
      userId,
    ).catch(err => this.logger.error(`Error tesorería cobro CxC #${id}: ${err.message}`));

    // Notificar en tiempo real
    const cuentaFinal = await this.findById(id);
    const eid = (cuentaFinal as any).empresaId;
    if (eid) {
      this.realtimeService.notify(eid, 'cxc',     'updated', id);
      this.realtimeService.notify(eid, 'factura',  'updated', cuentaFinal.facturaId);
    }
    return cuentaFinal;
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────────────

  async getCuentas(filtro: FiltroCuentasDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, estado, fechaDesde, fechaHasta } = filtro;

    const qb = this.cxcRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.factura', 'factura')
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
    const cuenta = await this.cxcRepository.findOne({
      where: { id, empresaId: (this as any).tenantService?.getEmpresaId(), isActive: true },
      relations: ['cliente', 'factura', 'user'],
    });
    if (!cuenta) throw new NotFoundException(`CxC #${id} no encontrada`);
    return cuenta;
  }

  async getPagos(cuentaId: number) {
    await this.findById(cuentaId);
    return this.pagoRepository.find({
      where: { cuentaPorCobrarId: cuentaId, isActive: true },
      relations: ['user'],
      order: { fecha: 'DESC' },
    });
  }

  async getCuentasVencidas() {
    return this.cxcRepository.find({
      where: {
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      relations: ['cliente', 'factura'],
      order: { fechaVencimiento: 'ASC' },
    });
  }

  async getCuentasPorCliente(clienteId: number, filtro: FiltroCuentasDto) {
    const { limit = 20, page = 1, estado } = filtro;

    const qb = this.cxcRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.factura', 'factura')
      .where('c.clienteId = :clienteId AND c.isActive = true', { clienteId });

    if (estado) qb.andWhere('c.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('c.fechaVencimiento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getResumenCobros() {
    const hoy = new Date();
    const en30 = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [porCobrar, vencido, porVencer, cobradoMes] = await Promise.all([
      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.estado NOT IN (:...exc)', {
          exc: [EstadoCuenta.PAGADA, EstadoCuenta.ANULADA],
        }).getRawOne<{ total: string }>(),

      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.estado = :e', { e: EstadoCuenta.VENCIDA })
        .getRawOne<{ total: string }>(),

      this.cxcRepository.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.isActive = true AND c.estado IN (:...ests)', {
          ests: [EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL],
        })
        .andWhere('c.fechaVencimiento BETWEEN :hoy AND :en30', { hoy, en30 })
        .getRawOne<{ total: string }>(),

      this.pagoRepository.createQueryBuilder('p')
        .select('COALESCE(SUM(p.monto), 0)', 'total')
        .where('p.isActive = true AND p.fecha >= :inicio', { inicio: inicioMes })
        .getRawOne<{ total: string }>(),
    ]);

    const cuenta = await this.cxcRepository.count({ where: { isActive: true } });

    return {
      totalCuentas:    cuenta,
      totalPorCobrar:  Number(porCobrar?.total ?? 0),
      totalVencido:    Number(vencido?.total ?? 0),
      totalPorVencer30: Number(porVencer?.total ?? 0),
      cobradoEsteMes:  Number(cobradoMes?.total ?? 0),
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

    await this.cxcRepository.update(id, { estado: EstadoCuenta.ANULADA });
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron jobs
  // ──────────────────────────────────────────────────────────────────

  @Cron('1 0 * * *')
  async actualizarEstadosVencidos() {
    const resultado = await this.cxcRepository.update(
      {
        estado: In([EstadoCuenta.PENDIENTE, EstadoCuenta.PAGADA_PARCIAL]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: EstadoCuenta.VENCIDA },
    );
    this.logger.log(`CxC vencidas actualizadas: ${resultado.affected ?? 0}`);
  }

  @Cron('0 8 * * *')
  async notificarCuentasVencidas() {
    const vencidas = await this.getCuentasVencidas();
    if (vencidas.length > 0) {
      this.logger.warn(
        `⚠️  ${vencidas.length} cuentas por cobrar vencidas. ` +
        `Monto total: $${vencidas.reduce((a, c) => a + Number(c.montoPendiente), 0).toFixed(2)}`,
      );
    }
  }
}
