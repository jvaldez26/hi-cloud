import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlanPago, EstadoPlanPago } from './entities/plan-pago.entity';
import { Cuota, EstadoCuota } from './entities/cuota.entity';
import { TenantService } from '../tenant/tenant.service';
import PDFDocument from 'pdfkit';
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
  private readonly logger = new Logger(CuotasService.name);

  constructor(
    @InjectRepository(PlanPago) private planRepo:  Repository<PlanPago>,
    @InjectRepository(Cuota)    private cuotaRepo: Repository<Cuota>,
    @InjectDataSource()         private ds:        DataSource,
    private tenantSvc:   TenantService,
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

  // ─── Generar comprobante PDF de cuota pagada (PDFKit) ────────────────────────

  async generarComprobantePDF(planId: number, cuotaId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();

    const cuota = await this.cuotaRepo.findOne({ where: { id: cuotaId } });
    if (!cuota) throw new NotFoundException(`Cuota #${cuotaId} no encontrada`);
    if (cuota.planPagoId !== planId) {
      throw new NotFoundException(`Cuota #${cuotaId} no pertenece al plan #${planId}`);
    }

    const plan = await this.planRepo.findOne({
      where: { id: planId, empresaId, isActive: true },
      relations: ['cuotas'],
    });
    if (!plan) throw new NotFoundException(`Plan de pago no encontrado`);

    if (cuota.estado !== EstadoCuota.PAGADA) {
      throw new BadRequestException('Solo se pueden generar comprobantes de cuotas pagadas');
    }

    const empresa = await this.ds.query(
      'SELECT nombre, "nombreComercial", rnc, direccion, ciudad, telefono FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    ).then((rows: any[]) => rows[0] || {});

    const pendientes = plan.cuotas.filter(
      c => c.estado === EstadoCuota.PENDIENTE || c.estado === EstadoCuota.VENCIDA,
    );
    const saldoPendiente  = pendientes.reduce((s, c) => s + Number(c.monto), 0);
    const cuotasRestantes = pendientes.length;
    const capital = Number(cuota.monto) - Number(cuota.interes ?? 0);
    const interes = Number(cuota.interes ?? 0);

    const buffer = await this.buildComprobantePDF({
      empresa, plan, cuota, capital, interes, saldoPendiente, cuotasRestantes,
    });
    return { buffer, filename: `comprobante-cuota-${cuotaId}.pdf` };
  }

  private buildComprobantePDF(d: {
    empresa:         any;
    plan:            PlanPago;
    cuota:           Cuota;
    capital:         number;
    interes:         number;
    saldoPendiente:  number;
    cuotasRestantes: number;
  }): Promise<Buffer> {
    const fmtMoney = (v: number): string =>
      'RD$' + Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fmtDate = (s?: string | null): string => {
      if (!s) return '—';
      const [y, m, day] = String(s).split('-');
      return `${day}/${m}/${y}`;
    };

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: { Title: `Comprobante Cuota #${d.cuota.numeroCuota} — ${d.plan.numero}` },
      });

      doc.on('data',  (c: Buffer) => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const L = 50;
      const R = 545;

      const sep = (bold = false) => {
        doc.moveDown(0.4);
        doc
          .moveTo(L, doc.y)
          .lineTo(R, doc.y)
          .lineWidth(bold ? 1.5 : 0.5)
          .stroke(bold ? '#000000' : '#aaaaaa');
        doc.moveDown(0.6);
      };

      // ── Encabezado empresa ──────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold')
         .text(d.empresa.nombre ?? '', { align: 'center' });

      if (d.empresa.rnc) {
        doc.fontSize(10).font('Helvetica')
           .text(`RNC: ${d.empresa.rnc}`, { align: 'center' });
      }
      if (d.empresa.direccion) {
        const dir = d.empresa.ciudad
          ? `${d.empresa.direccion}, ${d.empresa.ciudad}`
          : d.empresa.direccion;
        doc.fontSize(9).text(dir, { align: 'center' });
      }
      if (d.empresa.telefono) {
        doc.fontSize(9).text(`Tel: ${d.empresa.telefono}`, { align: 'center' });
      }

      sep();

      // ── Título ──────────────────────────────────────────────
      doc.fontSize(14).font('Helvetica-Bold')
         .text('COMPROBANTE DE PAGO DE CUOTA', { align: 'center' });

      sep();

      // ── Identificación ──────────────────────────────────────
      doc.fontSize(10).font('Helvetica')
         .text('No. Comprobante:', { continued: true })
         .font('Helvetica-Bold')
         .text(`COMP-${String(d.cuota.id).padStart(6, '0')}`, { align: 'right' });

      doc.font('Helvetica')
         .text('Fecha emisión:', { continued: true })
         .font('Helvetica-Bold')
         .text(fmtDate(fechaHoyRD()), { align: 'right' });

      sep();

      // ── Plan de pago ────────────────────────────────────────
      doc.fontSize(10).font('Helvetica-Bold').text('PLAN DE PAGO');
      doc.moveDown(0.25);

      doc.font('Helvetica')
         .text('Número:', { continued: true })
         .font('Helvetica-Bold')
         .text(d.plan.numero, { align: 'right' });

      doc.font('Helvetica')
         .text('Cliente:', { continued: true })
         .text(d.plan.clienteNombre ?? '—', { align: 'right' });

      if (d.plan.facturaFolio) {
        doc.text('Factura ref.:', { continued: true })
           .text(d.plan.facturaFolio, { align: 'right' });
      }

      sep();

      // ── Detalle de la cuota ──────────────────────────────────
      doc.fontSize(10).font('Helvetica-Bold')
         .text(`CUOTA #${d.cuota.numeroCuota} DE ${d.plan.numeroCuotas}`);
      doc.moveDown(0.25);

      doc.font('Helvetica')
         .text('Fecha vencimiento:', { continued: true })
         .font('Helvetica-Bold')
         .text(fmtDate(d.cuota.fechaVencimiento), { align: 'right' });

      doc.font('Helvetica')
         .text('Fecha de pago:', { continued: true })
         .font('Helvetica-Bold')
         .text(fmtDate(d.cuota.fechaPago), { align: 'right' });

      if (d.cuota.referenciaPago) {
        doc.font('Helvetica')
           .text('Referencia pago:', { continued: true })
           .text(d.cuota.referenciaPago, { align: 'right' });
      }

      sep();

      // ── Desglose ────────────────────────────────────────────
      doc.fontSize(10).font('Helvetica-Bold').text('DESGLOSE');
      doc.moveDown(0.25);

      doc.font('Helvetica')
         .text('Capital:', { continued: true })
         .font('Helvetica-Bold')
         .text(fmtMoney(d.capital), { align: 'right' });

      if (d.interes > 0) {
        doc.font('Helvetica')
           .text(`Intereses (${Number(d.plan.tasaInteresMensual)}% mens.):`, { continued: true })
           .font('Helvetica-Bold')
           .text(fmtMoney(d.interes), { align: 'right' });
      }

      sep(true);

      // ── Total pagado ─────────────────────────────────────────
      doc.fontSize(13).font('Helvetica-Bold')
         .text('TOTAL PAGADO:', { continued: true })
         .text(fmtMoney(Number(d.cuota.montoPagado ?? d.cuota.monto)), { align: 'right' });

      sep(true);

      // ── Saldo pendiente ──────────────────────────────────────
      doc.fontSize(10).font('Helvetica')
         .text('Saldo pendiente:', { continued: true })
         .font('Helvetica-Bold')
         .text(fmtMoney(d.saldoPendiente), { align: 'right' });

      doc.font('Helvetica')
         .text('Cuotas restantes:', { continued: true })
         .text(`${d.cuotasRestantes} de ${d.plan.numeroCuotas}`, { align: 'right' });

      // ── Footer ───────────────────────────────────────────────
      doc.moveDown(2);
      doc
        .moveTo(L, doc.y)
        .lineTo(R, doc.y)
        .lineWidth(0.5)
        .stroke('#aaaaaa');
      doc.moveDown(0.5);

      doc.fontSize(8).fillColor('#666666')
         .text('Este documento es constancia del pago de la cuota indicada.', { align: 'center' })
         .text('Conserve este comprobante para sus registros.', { align: 'center' })
         .moveDown(0.3)
         .text('HiCloud ERP · hicloudrd.com', { align: 'center' });

      doc.end();
    });
  }
}
