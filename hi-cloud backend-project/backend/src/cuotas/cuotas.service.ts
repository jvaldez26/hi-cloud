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

    // Papel térmico 80mm = 226.77 pt  (1 mm = 2.8346 pt)
    const PW  = 226.77;  // page width (80 mm)
    const MAR = 8;       // margen lateral (≈ 3 mm)
    const CW  = PW - MAR * 2; // ancho de contenido

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size:   [PW, 800],   // alto provisional — PDFKit no soporta altura dinámica,
        margin: MAR,         // pero la impresora térmica ignora el alto del PDF
        info:   { Title: `Comprobante Cuota #${d.cuota.numeroCuota} — ${d.plan.numero}` },
      });

      doc.on('data',  (c: Buffer) => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const sep = (bold = false) => {
        doc.moveDown(0.3);
        doc
          .moveTo(MAR, doc.y)
          .lineTo(PW - MAR, doc.y)
          .lineWidth(bold ? 1.2 : 0.4)
          .stroke('#000000');
        doc.moveDown(0.4);
      };

      const row = (label: string, value: string, valBold = false) => {
        const y = doc.y;
        doc.font('Helvetica').fontSize(7).text(label, MAR, y, { width: CW * 0.55 });
        doc.font(valBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
           .text(value, MAR, y, { width: CW, align: 'right' });
        doc.y = doc.y + 1;
      };

      // ── Encabezado empresa ──────────────────────────────────
      doc.fontSize(10).font('Helvetica-Bold')
         .text(d.empresa.nombre ?? '', { align: 'center', width: CW });

      if (d.empresa.rnc) {
        doc.fontSize(7).font('Helvetica')
           .text(`RNC: ${d.empresa.rnc}`, { align: 'center', width: CW });
      }
      if (d.empresa.direccion) {
        const dir = d.empresa.ciudad
          ? `${d.empresa.direccion}, ${d.empresa.ciudad}`
          : d.empresa.direccion;
        doc.fontSize(6).text(dir, { align: 'center', width: CW });
      }
      if (d.empresa.telefono) {
        doc.fontSize(6).text(`Tel: ${d.empresa.telefono}`, { align: 'center', width: CW });
      }

      sep();

      // ── Título ──────────────────────────────────────────────
      doc.fontSize(8).font('Helvetica-Bold')
         .text('COMPROBANTE DE PAGO DE CUOTA', { align: 'center', width: CW });

      sep();

      // ── Identificación ──────────────────────────────────────
      row('No. Comprobante:', `COMP-${String(d.cuota.id).padStart(6, '0')}`, true);
      row('Fecha emisión:', fmtDate(fechaHoyRD()), true);

      sep();

      // ── Plan de pago ────────────────────────────────────────
      doc.fontSize(7).font('Helvetica-Bold').text('PLAN DE PAGO', { width: CW });
      doc.moveDown(0.2);

      row('Número:', d.plan.numero, true);
      row('Cliente:', d.plan.clienteNombre ?? '—');
      if (d.plan.facturaFolio) row('Factura ref.:', d.plan.facturaFolio);

      sep();

      // ── Detalle de la cuota ──────────────────────────────────
      doc.fontSize(7).font('Helvetica-Bold')
         .text(`CUOTA #${d.cuota.numeroCuota} DE ${d.plan.numeroCuotas}`, { width: CW });
      doc.moveDown(0.2);

      row('Fecha vencimiento:', fmtDate(d.cuota.fechaVencimiento));
      row('Fecha de pago:', fmtDate(d.cuota.fechaPago), true);
      if (d.cuota.referenciaPago) row('Referencia:', d.cuota.referenciaPago);

      sep();

      // ── Desglose ────────────────────────────────────────────
      doc.fontSize(7).font('Helvetica-Bold').text('DESGLOSE', { width: CW });
      doc.moveDown(0.2);

      row('Capital:', fmtMoney(d.capital), true);
      if (d.interes > 0) {
        row(`Intereses (${Number(d.plan.tasaInteresMensual)}% mens.):`, fmtMoney(d.interes), true);
      }

      sep(true);

      // ── Total pagado ─────────────────────────────────────────
      const totalY = doc.y;
      doc.font('Helvetica-Bold').fontSize(7).text('TOTAL PAGADO:', MAR, totalY, { width: CW * 0.55 });
      doc.font('Helvetica-Bold').fontSize(10)
         .text(fmtMoney(Number(d.cuota.montoPagado ?? d.cuota.monto)), MAR, totalY, { width: CW, align: 'right' });
      doc.moveDown(0.5);

      sep(true);

      // ── Saldo pendiente ──────────────────────────────────────
      row('Saldo pendiente:', fmtMoney(d.saldoPendiente), true);
      row('Cuotas restantes:', `${d.cuotasRestantes} de ${d.plan.numeroCuotas}`);

      // ── Footer ───────────────────────────────────────────────
      doc.moveDown(0.8);
      doc
        .moveTo(MAR, doc.y)
        .lineTo(PW - MAR, doc.y)
        .lineWidth(0.4)
        .stroke('#000000');
      doc.moveDown(0.4);

      doc.fontSize(6).fillColor('#444444')
         .text('Constancia de pago. Conserve este comprobante.', { align: 'center', width: CW })
         .moveDown(0.2)
         .text('HiCloud ERP · hicloudrd.com', { align: 'center', width: CW });

      doc.end();
    });
  }
}
