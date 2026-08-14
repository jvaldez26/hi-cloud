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

    // Número secuencial por empresa — atómico vía siguiente_numero_secuencia
    const empresaId = this.tenantSvc.getEmpresaId();
    const [{ n }] = await this.ds.query<{ n: number }[]>(
      `SELECT siguiente_numero_secuencia($1, 'COMP') AS n`, [empresaId],
    );
    const numero = `COMP-${String(n).padStart(6, '0')}`;

    await this.cuotaRepo.update(cuotaId, {
      estado:         EstadoCuota.PAGADA,
      montoPagado:    cuota.monto,
      fechaPago:      fechaHoyRD(),
      referenciaPago: referencia,
      empresaId,
      numero,
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
      const [, m, day] = String(s).split('-');
      return `${day}/${m}/${String(s).split('-')[0]}`;
    };

    return new Promise<Buffer>((resolve, reject) => {
      // Mismas dimensiones que generarReciboPOSPDF en factura-pdf.helper.ts
      const TW = 200;
      const doc = new PDFDocument({ size: [TW, 800], margin: 0, compress: true });
      const chunks: Buffer[] = [];

      doc.on('data',  (c: Buffer) => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PL = 8;
      const PR = TW - 8;
      const W  = PR - PL;   // 184 pt
      let y    = 10;

      const center = (text: string, fontSize: number, font = 'Helvetica', color = '#000') => {
        doc.fillColor(color).font(font).fontSize(fontSize)
           .text(text, PL, y, { width: W, align: 'center' });
        y += fontSize + 3;
      };

      const sepDash = () => {
        doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#ccc').lineWidth(0.5).stroke();
        y += 6;
      };

      const sepSolid = () => {
        doc.moveTo(PL, y).lineTo(PR, y).strokeColor('#000').lineWidth(1).stroke();
        y += 6;
      };

      // label izquierda, valor derecha — igual que totRow() en el recibo POS
      const row = (lbl: string, val: string, bold = false) => {
        const font = bold ? 'Helvetica-Bold' : 'Helvetica';
        const size = bold ? 9 : 8;
        doc.fillColor('#000').font(font).fontSize(size);
        doc.text(lbl, PL, y, { width: W * 0.6 });
        doc.text(val, PL + W * 0.5, y, { width: W * 0.5, align: 'right' });
        y += size + 4;
      };

      // ── Encabezado empresa ──────────────────────────────────
      center(d.empresa.nombre ?? '', 11, 'Helvetica-Bold');
      if (d.empresa.rnc)      center(`RNC: ${d.empresa.rnc}`, 8);
      if (d.empresa.telefono) center(d.empresa.telefono, 8);
      if (d.empresa.direccion) {
        const dir = d.empresa.ciudad
          ? `${d.empresa.direccion}, ${d.empresa.ciudad}`
          : d.empresa.direccion;
        center(dir, 7);
      }

      y += 4;
      sepDash();

      // ── Título ──────────────────────────────────────────────
      center('COMPROBANTE DE PAGO DE CUOTA', 9, 'Helvetica-Bold');
      y += 2;
      sepSolid();

      // ── Identificación ──────────────────────────────────────
      // Usa el número almacenado; fallback al id para cuotas anteriores a la migración
      row('No. Comprobante:', d.cuota.numero ?? `COMP-${String(d.cuota.id).padStart(6, '0')}`, true);
      row('Fecha emisión:', fmtDate(fechaHoyRD()));

      y += 2;
      sepDash();

      // ── Plan de pago ────────────────────────────────────────
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7)
         .text('PLAN DE PAGO', PL, y, { width: W });
      y += 10;

      row('Número:', d.plan.numero, true);
      row('Cliente:', d.plan.clienteNombre ?? '—');
      if (d.plan.facturaFolio) row('Factura ref.:', d.plan.facturaFolio);

      y += 2;
      sepDash();

      // ── Detalle de la cuota ──────────────────────────────────
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7)
         .text(`CUOTA #${d.cuota.numeroCuota} DE ${d.plan.numeroCuotas}`, PL, y, { width: W });
      y += 10;

      row('Vencimiento:', fmtDate(d.cuota.fechaVencimiento));
      row('Fecha de pago:', fmtDate(d.cuota.fechaPago), true);
      if (d.cuota.referenciaPago) row('Referencia:', d.cuota.referenciaPago);

      y += 2;
      sepDash();

      // ── Desglose ────────────────────────────────────────────
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7)
         .text('DESGLOSE', PL, y, { width: W });
      y += 10;

      row('Capital:', fmtMoney(d.capital));
      if (d.interes > 0) {
        row(`Intereses (${Number(d.plan.tasaInteresMensual)}% m.):`, fmtMoney(d.interes));
      }

      y += 4;
      sepSolid();
      y -= 2;

      // ── Total pagado ─────────────────────────────────────────
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(8)
         .text('TOTAL PAGADO:', PL, y, { width: W, align: 'center' });
      y += 12;
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(12)
         .text(fmtMoney(Number(d.cuota.montoPagado ?? d.cuota.monto)), PL, y, { width: W, align: 'center' });
      y += 17;

      sepSolid();

      // ── Saldo pendiente ──────────────────────────────────────
      row('Saldo pendiente:', fmtMoney(d.saldoPendiente));
      row('Cuotas restantes:', `${d.cuotasRestantes} de ${d.plan.numeroCuotas}`);

      // ── Footer ───────────────────────────────────────────────
      y += 4;
      sepDash();

      center('Constancia de pago de cuota.', 7);
      center('Conserve este comprobante.', 7);
      y += 2;
      center('HiCloud ERP · hicloudrd.com', 7, 'Helvetica', '#888888');

      // Altura dinámica — igual que generarReciboPOSPDF
      doc.page.height = y + 20;
      doc.end();
    });
  }
}
