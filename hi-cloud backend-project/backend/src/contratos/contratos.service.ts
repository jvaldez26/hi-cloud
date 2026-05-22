import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  Contrato, EstadoContrato, PeriodoFacturacion,
} from './entities/contrato.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateContratoDto {
  clienteId:           number;
  nombre:              string;
  descripcionServicio: string;
  fechaInicio:         string;
  fechaFin?:           string;
  periodoFacturacion:  PeriodoFacturacion;
  montoBase:           number;
  porcentajeIva?:      number;
  diaFacturacion?:     number;
  facturaAutomatica?:  boolean;
  terminos?:           string;
  userId:              number;
}

@Injectable()
export class ContratosService {
  private readonly logger = new Logger(ContratosService.name);

  constructor(
    @InjectRepository(Contrato)
    private repo: Repository<Contrato>,
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private detalleRepo: Repository<FacturaDetalle>,
    private tenantService: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const now      = new Date();
    const y        = now.getFullYear();
    const m        = String(now.getMonth() + 1).padStart(2, '0');
    const prefix   = `CTR-${y}${m}-`;
    const empresaId = this.tenantService.getEmpresaId();

    // Prefijo dinámico mensual → incompatible con generarNumeroSecuencial.
    // Filtramos SIEMPRE por empresaId para garantizar aislamiento multi-tenant.
    const result = await this.repo
      .createQueryBuilder('c')
      .select(`MAX(CAST(SPLIT_PART(c.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('c.numero LIKE :p', { p: `${prefix}%` })
      .andWhere('c.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();

    const next = (result?.maxNum ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private calcularProximaFactura(periodo: PeriodoFacturacion, desde: Date, dia: number): Date {
    const prox = new Date(desde);
    const meses: Record<PeriodoFacturacion, number> = {
      mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
    };
    prox.setMonth(prox.getMonth() + meses[periodo]);
    prox.setDate(Math.min(dia, new Date(prox.getFullYear(), prox.getMonth() + 1, 0).getDate()));
    return prox;
  }

  async crear(dto: CreateContratoDto): Promise<Contrato> {
    const numero    = await this.generarNumero();
    const inicio    = new Date(dto.fechaInicio);
    const dia       = dto.diaFacturacion ?? 1;
    const proxFact  = this.calcularProximaFactura(dto.periodoFacturacion, inicio, dia);

    return this.repo.save(
      this.repo.create({
        empresaId:           this.tenantService.getEmpresaId(),
        numero,
        clienteId:           dto.clienteId,
        nombre:              dto.nombre,
        descripcionServicio: dto.descripcionServicio,
        fechaInicio:         inicio,
        fechaFin:            dto.fechaFin ? new Date(dto.fechaFin) : undefined,
        periodoFacturacion:  dto.periodoFacturacion,
        montoBase:           dto.montoBase,
        porcentajeIva:       dto.porcentajeIva ?? 18,
        diaFacturacion:      dia,
        proximaFactura:      proxFact,
        facturaAutomatica:   dto.facturaAutomatica ?? true,
        terminos:            dto.terminos,
        userId:              dto.userId,
      }),
    );
  }

  async listar(pagination: PaginationDto, estado?: EstadoContrato) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.repo.createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .where('c.isActive = :a AND c.empresaId = :eid', { a: true, eid: this.tenantService.getEmpresaId() });

    if (estado)  qb.andWhere('c.estado = :e',   { e: estado });
    if (search)  qb.andWhere('(c.nombre ILIKE :s OR cliente.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('c.proximaFactura', 'ASC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number): Promise<Contrato> {
    const c = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true }, relations: ['cliente', 'user'] });
    if (!c) throw new NotFoundException(`Contrato #${id} no encontrado`);
    return c;
  }

  async cambiarEstado(id: number, estado: EstadoContrato) {
    await this.findById(id);
    await this.repo.update(id, { estado });
    return this.findById(id);
  }

  async generarFactura(id: number): Promise<Factura> {
    const contrato = await this.findById(id);
    if (contrato.estado !== EstadoContrato.ACTIVO) {
      throw new BadRequestException('Solo se pueden facturar contratos activos');
    }

    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `FAC-${y}${m}-`;
    const maxRes = await this.facturaRepo
      .createQueryBuilder('f')
      .select(`MAX(CAST(SPLIT_PART(f.folio, '-', 3) AS INTEGER))`, 'maxNum')
      .where('f.folio LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ maxNum: number | null }>();
    const folio = `${prefix}${String((maxRes?.maxNum ?? 0) + 1).padStart(4, '0')}`;

    const iva      = Number(contrato.montoBase) * Number(contrato.porcentajeIva) / 100;
    const total    = Number(contrato.montoBase) + iva;

    const factura = await this.facturaRepo.save(
      this.facturaRepo.create({
        // En cron: usar empresaId del contrato; en request: getEmpresaId()
        empresaId: contrato.empresaId ?? (() => { try { return this.tenantService.getEmpresaId(); } catch { return undefined; } })(),
        folio,
        fecha:     now,
        estado:    FacturaEstado.BORRADOR,
        clienteId: contrato.clienteId,
        usuarioId: contrato.userId,
        notas:     `Contrato ${contrato.numero}: ${contrato.nombre}`,
        subtotal:  Number(contrato.montoBase),
        iva:       Number(iva.toFixed(2)),
        total:     Number(total.toFixed(2)),
      }),
    );

    await this.detalleRepo.save(
      this.detalleRepo.create({
        facturaId:      factura.id,
        descripcion:    contrato.descripcionServicio,
        cantidad:       1,
        precioUnitario: Number(contrato.montoBase),
        porcentajeIva:  Number(contrato.porcentajeIva),
        subtotal:       Number(contrato.montoBase),
        importeIva:     Number(iva.toFixed(2)),
        total:          Number(total.toFixed(2)),
      }),
    );

    const proxima = this.calcularProximaFactura(
      contrato.periodoFacturacion, now, contrato.diaFacturacion,
    );

    await this.repo.update(id, {
      ultimaFactura:        now,
      proximaFactura:       proxima,
      totalFacturasGeneradas: contrato.totalFacturasGeneradas + 1,
    });

    this.logger.log(`Contrato ${contrato.numero} → Factura ${folio} generada`);
    return factura;
  }

  // ── Cron: generar facturas automáticas de contratos que toca hoy ──────────

  @Cron('20 0 * * *')
  async procesarContratosPendientes() {
    try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const contratos = await this.repo.find({
      where: {
        estado: EstadoContrato.ACTIVO,
        facturaAutomatica: true,
        isActive: true,
      },
      relations: ['cliente'],
    });

    let generadas = 0;
    for (const c of contratos) {
      if (!c.proximaFactura) continue;
      const prox = new Date(c.proximaFactura);
      prox.setHours(0, 0, 0, 0);
      if (prox <= hoy) {
        try {
          if (c.fechaFin && new Date(c.fechaFin) < hoy) {
            await this.repo.update(c.id, { estado: EstadoContrato.VENCIDO });
            continue;
          }
          await this.generarFactura(c.id);
          generadas++;
        } catch (err) {
          this.logger.error(`Error facturando contrato #${c.id}: ${(err as Error).message}`);
        }
      }
    }

    if (generadas > 0) this.logger.log(`${generadas} facturas de contratos generadas`);
    } catch (err) {
      this.logger.error(`Cron contratos falló: ${(err as Error).message}`, (err as Error).stack);
    }
  }
}
