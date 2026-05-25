import { Injectable, Logger } from '@nestjs/common';
import { ReportesFinancierosService } from './reportes-financieros.service';
import { TenantService } from '../tenant/tenant.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { generarReportePDF } from '../common/pdf/tabular-pdf.helper';
import type { TabularReportData } from '../common/pdf/tabular-pdf.helper';

const FMT = (n: number) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
  }).format(n ?? 0);

@Injectable()
export class ReportesPdfService {
  private readonly logger = new Logger(ReportesPdfService.name);

  constructor(
    private svc:       ReportesFinancierosService,
    private tenantSvc: TenantService,
    @InjectRepository(Empresa) private empresaRepo: Repository<Empresa>,
  ) {}

  private async getEmpresa(): Promise<Empresa | null> {
    try {
      const id = this.tenantSvc.getEmpresaId();
      return await this.empresaRepo.findOne({ where: { id, isActive: true } });
    } catch { return null; }
  }

  // ── Estado de Resultados ───────────────────────────────────────────────────

  async generarEstadoResultadosPDF(desde: string, hasta: string): Promise<{ buffer: Buffer; filename: string }> {
    const [er, empresa] = await Promise.all([
      this.svc.estadoResultados(desde, hasta),
      this.getEmpresa(),
    ]);

    const fmtRange = (d: string, h: string) => {
      const fmt = (s: string) =>
        new Date(s + 'T12:00:00').toLocaleDateString('es-DO', {
          day: '2-digit', month: 'long', year: 'numeric',
        });
      return `Del ${fmt(d)} al ${fmt(h)}`;
    };

    // Aplanar cuentas en filas
    const rows: Record<string, any>[] = [];

    const addSection = (label: string, obj: any) => {
      if (!obj) return;
      rows.push({ tipo: 'header', nombre: label, monto: null });
      for (const c of (obj.cuentas ?? [])) {
        rows.push({ tipo: 'item', nombre: '  ' + c.nombre, monto: Number(c.saldo ?? 0) });
      }
      rows.push({ tipo: 'subtotal', nombre: `Subtotal ${label}`, monto: Number(obj.total ?? 0) });
    };

    addSection('INGRESOS', (er as any).ingresos);
    addSection('COSTOS',   (er as any).costos);
    addSection('GASTOS',   (er as any).gastos);

    const utilidad = Number((er as any).resultados?.utilidadNeta ?? (er as any).utilidadNeta ?? 0);

    const report: TabularReportData = {
      titulo:    'Estado de Resultados',
      subtitulo: fmtRange(desde, hasta),
      empresa:   empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
      rnc:       empresa?.rnc,
      columns: [
        { header: 'Concepto', key: 'nombre', width: 75 },
        { header: 'Monto',    key: 'monto',  width: 25, money: true, align: 'right' },
      ],
      rows: rows.filter(r => r.tipo === 'item'),
      summaryCards: [
        { label: 'Utilidad Neta', value: FMT(utilidad), red: utilidad < 0 },
      ],
      totalRow: {
        nombre: utilidad >= 0 ? 'UTILIDAD NETA' : '(PÉRDIDA)',
        monto:  Math.abs(utilidad),
      },
    };

    const buffer = await generarReportePDF(report);
    this.logger.log(`PDF Estado de Resultados generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Estado-Resultados-${desde}-${hasta}.pdf` };
  }

  // ── Balance General ────────────────────────────────────────────────────────

  async generarBalanceGeneralPDF(fechaCorte: string): Promise<{ buffer: Buffer; filename: string }> {
    const [bg, empresa] = await Promise.all([
      this.svc.balanceGeneral(fechaCorte),
      this.getEmpresa(),
    ]);

    const fmtDate = (d: string) =>
      new Date(d + 'T12:00:00').toLocaleDateString('es-DO', {
        day: '2-digit', month: 'long', year: 'numeric',
      });

    const flatCuentas = (obj: any): any[] =>
      obj?.cuentas ?? [
        ...(obj?.corriente?.cuentas  ?? []),
        ...(obj?.noCorriente?.cuentas ?? []),
      ];

    const activos    = Number((bg as any).totales?.activos            ?? (bg as any).activo?.total    ?? 0);
    const pasivos    = Number((bg as any).totales?.pasivosPatrimonio  ?? (bg as any).pasivo?.total    ?? 0)
                     - Number((bg as any).patrimonio?.total ?? 0);
    const patrimonio = Number((bg as any).patrimonio?.total ?? 0);

    const rows: Record<string, any>[] = [
      ...flatCuentas((bg as any).activo).map((c: any) => ({
        seccion: 'ACTIVOS', nombre: c.nombre ?? c.cuenta, monto: Number(c.saldo ?? c.total ?? 0),
      })),
      ...flatCuentas((bg as any).pasivo).map((c: any) => ({
        seccion: 'PASIVOS', nombre: c.nombre ?? c.cuenta, monto: Number(c.saldo ?? c.total ?? 0),
      })),
      ...flatCuentas((bg as any).patrimonio).map((c: any) => ({
        seccion: 'PATRIMONIO', nombre: c.nombre ?? c.cuenta, monto: Number(c.saldo ?? c.total ?? 0),
      })),
    ];

    const report: TabularReportData = {
      titulo:    'Balance General',
      subtitulo: `Al ${fmtDate(fechaCorte)}`,
      empresa:   empresa?.nombreComercial ?? empresa?.nombre ?? 'Mi Empresa',
      rnc:       empresa?.rnc,
      columns: [
        { header: 'Sección', key: 'seccion', width: 15 },
        { header: 'Cuenta',  key: 'nombre',  width: 60 },
        { header: 'Saldo',   key: 'monto',   width: 25, money: true, align: 'right' },
      ],
      rows,
      summaryCards: [
        { label: 'Total Activos',    value: FMT(activos) },
        { label: 'Total Pasivos',    value: FMT(pasivos),    red: pasivos < 0 },
        { label: 'Total Patrimonio', value: FMT(patrimonio) },
      ],
      totalRow: {
        seccion: '',
        nombre:  'TOTAL PASIVOS + PATRIMONIO',
        monto:   pasivos + patrimonio,
      },
    };

    const buffer = await generarReportePDF(report);
    this.logger.log(`PDF Balance General generado para empresa #${empresa?.id}`);
    return { buffer, filename: `Balance-General-${fechaCorte}.pdf` };
  }
}
