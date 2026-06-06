import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlanPago, EstadoPlanPago } from './entities/plan-pago.entity';
import { Cuota, EstadoCuota } from './entities/cuota.entity';
import { TenantService } from '../tenant/tenant.service';
import { BrowserService } from '../common/services/browser.service';
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
    private browserSvc:  BrowserService,
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

  // ─── Generar comprobante PDF de cuota pagada ──────────────────────────────────

  async generarComprobantePDF(cuotaId: number): Promise<{ buffer: Buffer; filename: string }> {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Cargar cuota y verificar que existe
    const cuota = await this.cuotaRepo.findOne({
      where: { id: cuotaId },
    });
    if (!cuota) throw new NotFoundException(`Cuota #${cuotaId} no encontrada`);

    // Verificar que la cuota pertenece a un plan de este tenant
    const plan = await this.planRepo.findOne({
      where: { id: cuota.planPagoId, empresaId, isActive: true },
      relations: ['cuotas'],
    });
    if (!plan) throw new NotFoundException(`Plan de pago no encontrado para esta empresa`);

    // Verificar que la cuota está pagada
    if (cuota.estado !== EstadoCuota.PAGADA) {
      throw new BadRequestException('Solo se pueden generar comprobantes de cuotas pagadas');
    }

    // Cargar datos de la empresa
    const empresa = await this.ds.query(
      'SELECT nombre, "nombreComercial", rnc, direccion, ciudad, telefono, logo FROM empresa WHERE id = $1 AND "isActive" = true LIMIT 1',
      [empresaId],
    ).then((rows: any[]) => rows[0] || {});

    // Cargar nombre del usuario responsable del plan
    const usuario = await this.ds.query(
      'SELECT nombre FROM users WHERE id = $1 LIMIT 1',
      [plan.usuarioId],
    ).then((rows: any[]) => rows[0] || null);

    // Descargar logo como data URI
    let logoDataUrl: string | undefined;
    if (empresa.logo) {
      try {
        const res = await fetch(empresa.logo, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          logoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        }
      } catch (e: any) {
        this.logger.warn(`Logo no descargado para comprobante: ${e?.message}`);
      }
    }

    // Calcular saldo pendiente y cuotas restantes
    const pendientes = plan.cuotas.filter(
      c => c.estado === EstadoCuota.PENDIENTE || c.estado === EstadoCuota.VENCIDA,
    );
    const saldoPendiente  = pendientes.reduce((s, c) => s + Number(c.monto), 0);
    const cuotasRestantes = pendientes.length;

    const capital = Number(cuota.monto) - Number(cuota.interes ?? 0);
    const interes = Number(cuota.interes ?? 0);

    const html = this.buildComprobanteHTML({
      empresa,
      plan,
      cuota,
      logoDataUrl,
      capital,
      interes,
      saldoPendiente,
      cuotasRestantes,
      usuarioNombre: usuario?.nombre,
      fechaEmision: fechaHoyRD(),
    });

    const buffer = await this.browserSvc.htmlToPDF(html, { thermal: true });
    return { buffer, filename: `comprobante-cuota-${cuotaId}.pdf` };
  }

  private buildComprobanteHTML(d: {
    empresa:         any;
    plan:            PlanPago;
    cuota:           Cuota;
    logoDataUrl?:    string;
    capital:         number;
    interes:         number;
    saldoPendiente:  number;
    cuotasRestantes: number;
    usuarioNombre?:  string;
    fechaEmision:    string;
  }): string {
    const fmt = (v: number) =>
      'RD$' + Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fmtDate = (s?: string | null) => {
      if (!s) return '—';
      const [y, m, day] = String(s).split('-');
      return `${day}/${m}/${y}`;
    };

    const tasa = Number(d.plan.tasaInteresMensual);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  /* ── Papel térmico 80mm — sin márgenes, ancho exacto ── */
  @page {
    margin: 0;
    size: 80mm auto;
  }
  *, *::before, *::after {
    margin: 0; padding: 0;
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: Arial, 'Helvetica Neue', sans-serif;
    font-size: 9pt;
    color: #000;
    background: #fff;
    width: 80mm;
    padding: 3mm 4mm 6mm;
    overflow: hidden;
  }

  /* ── Utilidades ── */
  .center { text-align: center; }
  .bold   { font-weight: 700; }

  /* ── Encabezado empresa ── */
  .logo        { max-height: 14mm; max-width: 28mm; display: block; margin: 0 auto 1.5mm; }
  .emp-nombre  { font-size: 11pt; font-weight: 700; line-height: 1.25; }
  .emp-sub     { font-size: 7.5pt; margin-top: 0.5mm; }

  /* ── Separadores ── */
  .ln-thick  { border: none; border-top: 1.5pt solid #000; margin: 2mm 0; }
  .ln-thin   { border: none; border-top: 0.5pt solid #000; margin: 1.5mm 0; }
  .ln-dash   { border: none; border-top: 0.5pt dashed #666; margin: 1.5mm 0; }

  /* ── Título del documento ── */
  .doc-title {
    text-align: center;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.3pt;
    padding: 1.5mm 0;
  }

  /* ── Secciones ── */
  .sec-header {
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3pt;
    border-bottom: 0.5pt solid #000;
    padding-bottom: 0.8mm;
    margin-bottom: 1.5mm;
  }
  .section { margin: 2mm 0; }

  /* ── Filas label / valor ── */
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2mm;
    margin-bottom: 1.2mm;
  }
  .lbl { font-size: 8pt; color: #333; flex-shrink: 0; }
  .val { font-size: 8pt; font-weight: 600; text-align: right; word-break: break-word; }

  /* ── Bloque TOTAL ── */
  .total-box {
    border-top: 1.5pt solid #000;
    border-bottom: 1.5pt solid #000;
    padding: 2mm 0;
    margin: 2mm 0;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .total-lbl { font-size: 10pt; font-weight: 700; }
  .total-val { font-size: 13pt; font-weight: 700; }

  /* ── Bloque saldo ── */
  .saldo-box {
    border: 0.5pt solid #000;
    padding: 1.5mm 2mm;
    margin: 1.5mm 0;
  }
  .saldo-lbl { font-size: 8pt; }
  .saldo-val { font-size: 9pt; font-weight: 700; }

  /* ── Pie ── */
  .footer { text-align: center; margin-top: 3mm; padding-top: 2mm; border-top: 0.5pt solid #000; }
  .footer-note  { font-size: 7pt; line-height: 1.5; color: #333; }
  .footer-brand { font-size: 8pt; font-weight: 700; margin-top: 1.5mm; }
</style>
</head>
<body>

  <!-- ── ENCABEZADO EMPRESA ── -->
  <div class="center">
    ${d.logoDataUrl ? `<img src="${d.logoDataUrl}" class="logo" alt="Logo"/>` : ''}
    <div class="emp-nombre">${d.empresa.nombre ?? ''}</div>
    ${d.empresa.nombreComercial ? `<div class="emp-sub">${d.empresa.nombreComercial}</div>` : ''}
    <div class="emp-sub">RNC: ${d.empresa.rnc ?? '—'}</div>
    ${d.empresa.direccion ? `<div class="emp-sub">${d.empresa.direccion}${d.empresa.ciudad ? `, ${d.empresa.ciudad}` : ''}</div>` : ''}
  </div>

  <hr class="ln-thick"/>
  <div class="doc-title">COMPROBANTE DE PAGO DE CUOTA</div>
  <hr class="ln-thick"/>

  <!-- ── IDENTIFICACIÓN ── -->
  <div class="section">
    <div class="row">
      <span class="lbl">No. Comprobante:</span>
      <span class="val">COMP-${String(d.cuota.id).padStart(6, '0')}</span>
    </div>
    <div class="row">
      <span class="lbl">Fecha emisión:</span>
      <span class="val">${fmtDate(d.fechaEmision)}</span>
    </div>
  </div>

  <hr class="ln-dash"/>

  <!-- ── PLAN DE PAGO ── -->
  <div class="section">
    <div class="sec-header">Plan de Pago</div>
    <div class="row">
      <span class="lbl">Número:</span>
      <span class="val bold">${d.plan.numero}</span>
    </div>
    <div class="row">
      <span class="lbl">Cliente:</span>
      <span class="val">${d.plan.clienteNombre ?? '—'}</span>
    </div>
    ${d.plan.facturaFolio ? `
    <div class="row">
      <span class="lbl">Factura ref.:</span>
      <span class="val">${d.plan.facturaFolio}</span>
    </div>` : ''}
  </div>

  <hr class="ln-dash"/>

  <!-- ── CUOTA ── -->
  <div class="section">
    <div class="sec-header">Cuota #${d.cuota.numeroCuota} de ${d.plan.numeroCuotas}</div>
    <div class="row">
      <span class="lbl">Vencimiento:</span>
      <span class="val">${fmtDate(d.cuota.fechaVencimiento)}</span>
    </div>
    <div class="row">
      <span class="lbl">Fecha de pago:</span>
      <span class="val bold">${fmtDate(d.cuota.fechaPago)}</span>
    </div>
    ${d.cuota.referenciaPago ? `
    <div class="row">
      <span class="lbl">Referencia:</span>
      <span class="val">${d.cuota.referenciaPago}</span>
    </div>` : ''}
  </div>

  <hr class="ln-dash"/>

  <!-- ── DESGLOSE ── -->
  <div class="section">
    <div class="sec-header">Desglose</div>
    <div class="row">
      <span class="lbl">Capital:</span>
      <span class="val">${fmt(d.capital)}</span>
    </div>
    ${d.interes > 0 ? `
    <div class="row">
      <span class="lbl">Intereses (${tasa}% mens.):</span>
      <span class="val">${fmt(d.interes)}</span>
    </div>` : ''}
  </div>

  <!-- ── TOTAL ── -->
  <div class="total-box">
    <span class="total-lbl">TOTAL PAGADO</span>
    <span class="total-val">${fmt(Number(d.cuota.montoPagado ?? d.cuota.monto))}</span>
  </div>

  <!-- ── SALDO PENDIENTE ── -->
  <div class="saldo-box">
    <div class="row">
      <span class="saldo-lbl">Saldo pendiente:</span>
      <span class="saldo-val">${fmt(d.saldoPendiente)}</span>
    </div>
    <div class="row" style="margin-top:0.8mm">
      <span class="lbl">Cuotas restantes:</span>
      <span class="val">${d.cuotasRestantes} de ${d.plan.numeroCuotas}</span>
    </div>
  </div>

  <!-- ── PIE ── -->
  <div class="footer">
    <div class="footer-note">
      Este documento es constancia del pago<br/>
      de la cuota indicada. Conserve este<br/>
      comprobante para sus registros.
    </div>
    ${d.usuarioNombre ? `<div class="footer-note" style="margin-top:1.5mm">Responsable: ${d.usuarioNombre}</div>` : ''}
    <div class="footer-brand">HiCloud ERP &middot; hicloudrd.com</div>
  </div>

</body>
</html>`;
  }
}
