import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlanPago, EstadoPlanPago } from './entities/plan-pago.entity';
import { Cuota, EstadoCuota } from './entities/cuota.entity';
import { TenantService } from '../tenant/tenant.service';
import dayjs from 'dayjs';
import { fechaHoyRD } from '../common/utils/fecha-local.util';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

interface CreatePlanDto {
  clienteId:           number;
  clienteNombre?:      string;
  facturaId?:          number;
  facturaFolio?:       string;
  montoTotal:          number;
  montoInicial?:       number;
  numeroCuotas:        number;
  tasaInteresMensual?: number;
  fechaInicio:         string;
  notas?:              string;
}

@Injectable()
export class CuotasService {
  constructor(
    @InjectRepository(PlanPago) private planRepo:  Repository<PlanPago>,
    @InjectRepository(Cuota)    private cuotaRepo: Repository<Cuota>,
    @InjectDataSource()         private ds:        DataSource,
    private tenantSvc: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'planes_pago', 'numero', '^PP-[0-9]+$', 'PP-', 1, empresaId,
    );
  }

  // ─── Calcular cuota mensual (fórmula de amortización francesa) ───────────────

  static calcularCuotaMensual(capital: number, tasaMensual: number, n: number): number {
    if (tasaMensual === 0) return +(capital / n).toFixed(2);
    const r = tasaMensual / 100;
    return +(capital * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)).toFixed(2);
  }

  // ─── Crear plan de pago ───────────────────────────────────────────────────────

  async crear(dto: CreatePlanDto, usuarioId: number) {
    const empresaId     = this.tenantSvc.getEmpresaId();
    const numero        = await this.generarNumero();
    const montoInicial  = dto.montoInicial ?? 0;
    const montoFinanciar = dto.montoTotal - montoInicial;
    const tasa          = dto.tasaInteresMensual ?? 0;
    const montoCuota    = CuotasService.calcularCuotaMensual(montoFinanciar, tasa, dto.numeroCuotas);

    const plan = await this.planRepo.save(
      this.planRepo.create({
        empresaId,
        numero,
        clienteId:        dto.clienteId,
        clienteNombre:    dto.clienteNombre,
        facturaId:        dto.facturaId,
        facturaFolio:     dto.facturaFolio,
        montoTotal:       dto.montoTotal,
        montoInicial,
        montoFinanciar,
        numeroCuotas:     dto.numeroCuotas,
        tasaInteresMensual: tasa,
        montoCuota,
        fechaInicio:      dto.fechaInicio,
        usuarioId,
        notas:            dto.notas,
      }),
    );

    // Generar tabla de cuotas
    const cuotas: Partial<Cuota>[] = [];
    for (let i = 1; i <= dto.numeroCuotas; i++) {
      const fechaVenc = dayjs(dto.fechaInicio).add(i, 'month').format('YYYY-MM-DD');
      const intereses = tasa > 0
        ? +(montoFinanciar * (tasa / 100) * (1 - Math.pow(1 + tasa / 100, -(dto.numeroCuotas - i + 1)))).toFixed(2)
        : 0;
      cuotas.push({
        planPagoId:       plan.id,
        numeroCuota:      i,
        fechaVencimiento: fechaVenc,
        monto:            montoCuota,
        interes:          intereses,
      });
    }
    await this.cuotaRepo.save(this.cuotaRepo.create(cuotas));

    return this.findOne(plan.id);
  }

  // ─── Listar planes ────────────────────────────────────────────────────────────

  async listar(clienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const where: any = { empresaId, isActive: true };
    if (clienteId) where.clienteId = clienteId;
    return this.planRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const plan = await this.planRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cuotas'],
    });
    if (!plan) throw new NotFoundException(`Plan de pago #${id} no encontrado`);
    return plan;
  }

  // ─── Registrar pago de cuota ──────────────────────────────────────────────────

  async pagarCuota(cuotaId: number, referencia?: string) {
    const cuota = await this.cuotaRepo.findOneByOrFail({ id: cuotaId });
    if (cuota.estado === EstadoCuota.PAGADA) {
      throw new BadRequestException('Esta cuota ya fue pagada');
    }

    await this.cuotaRepo.update(cuotaId, {
      estado:         EstadoCuota.PAGADA,
      montoPagado:    cuota.monto,
      fechaPago:      fechaHoyRD(),
      referenciaPago: referencia,
    });

    // Verificar si todas las cuotas están pagadas
    const plan          = await this.findOne(cuota.planPagoId);
    const todasPagadas  = plan.cuotas.every(c => c.id === cuotaId || c.estado === EstadoCuota.PAGADA);
    if (todasPagadas) {
      await this.planRepo.update(plan.id, { estado: EstadoPlanPago.COMPLETADO });
    }

    return this.cuotaRepo.findOneByOrFail({ id: cuotaId });
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.planRepo
      .createQueryBuilder('p')
      .select('p.estado', 'estado')
      .addSelect('COUNT(p.id)', 'cantidad')
      .addSelect('COALESCE(SUM(p."montoTotal"), 0)', 'montoTotal')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = :a', { a: true })
      .groupBy('p.estado')
      .getRawMany<{ estado: string; cantidad: string; montoTotal: string }>();

    const cuotasVenc = await this.cuotaRepo
      .createQueryBuilder('c')
      .innerJoin('c.planPago', 'p')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('c.estado = :e', { e: 'pendiente' })
      .andWhere('c."fechaVencimiento" < CURRENT_DATE')
      .getCount();

    return {
      planes:       raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad), montoTotal: Number(r.montoTotal) })),
      cuotasVencidas: cuotasVenc,
    };
  }
}
