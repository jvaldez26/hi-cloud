import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LimitesService } from '../suscripciones/limites.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFKit = require('pdfkit') as typeof import('pdfkit');

/** Lanza ConflictException amigable si el error es 23505 (duplicate key) */
function handleRfcDuplicate(err: any, rfc?: string): never {
  if (err?.code === '23505' || err?.message?.includes('duplicate key') || err?.message?.includes('ya existe')) {
    throw new ConflictException(
      rfc
        ? `Ya existe un cliente con RNC/Cédula ${rfc} en su empresa`
        : 'Ya existe un cliente con ese RNC/Cédula en su empresa',
    );
  }
  throw err;
}

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    private dataSource:       DataSource,
    private tenantService:    TenantService,
    private realtimeService:  RealtimeService,
    private limitesService:   LimitesService,
  ) {}

  async create(dto: CreateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteClientes(empresaId);

    const cliente = this.clienteRepository.create({ ...dto, empresaId });
    try {
      const saved = await this.clienteRepository.save(cliente);
      this.realtimeService.notify(empresaId, 'cliente', 'created', saved.id);
      return saved;
    } catch (err: unknown) {
      handleRfcDuplicate(err, dto.rfc);
    }
  }

  async findAll(pagination: PaginationDto) {
    const empresaId        = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.clienteRepository
      .createQueryBuilder('cliente')
      .where('cliente.empresaId = :empresaId', { empresaId })
      .andWhere('cliente.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(cliente.nombre ILIKE :s OR cliente.rfc ILIKE :s OR cliente.razonSocial ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('cliente.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente = await this.clienteRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente #${id} no encontrado`);
    return cliente;
  }

  async findByRfc(rfc: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente = await this.clienteRepository.findOne({
      where: { rfc, empresaId, isActive: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente con RNC/Cédula ${rfc} no encontrado`);
    return cliente;
  }

  async update(id: number, dto: UpdateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findOne(id); // valida que existe en este tenant

    try {
      await this.clienteRepository.update(id, dto);
    } catch (err: unknown) {
      handleRfcDuplicate(err, dto.rfc);
    }

    this.realtimeService.notify(empresaId, 'cliente', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);
    await this.clienteRepository.update(id, { isActive: false });
    this.realtimeService.notify(empresaId, 'cliente', 'deleted', id);
    return { message: `Cliente "${cliente.nombre}" eliminado` };
  }

  async getEstadoCuenta(id: number, fechaDesde?: string, fechaHasta?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);

    // Usar parámetros posicionales para evitar SQL injection
    const facturasParams: unknown[] = [id, empresaId];
    let fechaWhere = '';
    if (fechaDesde) { fechaWhere += ` AND f.fecha >= $${facturasParams.push(fechaDesde)}`; }
    if (fechaHasta) { fechaWhere += ` AND f.fecha <= $${facturasParams.push(fechaHasta)}`; }

    const facturas = await this.dataSource.query<{
      folio: string; fecha: string; estado: string;
      total: string; montoPagado: string; montoPendiente: string;
    }[]>(
      `SELECT f.folio, f.fecha::text, f.estado,
              f.total::text,
              COALESCE(cxc."montoPagado", 0)::text    AS "montoPagado",
              COALESCE(cxc."montoPendiente", f.total)::text AS "montoPendiente"
       FROM facturas f
       LEFT JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = f.id
       WHERE f."clienteId" = $1 AND f."empresaId" = $2 AND f."isActive" = true
         AND f.estado NOT IN ('borrador','cancelada')${fechaWhere}
       ORDER BY f.fecha DESC`,
      facturasParams,
    );

    const cobros = await this.dataSource.query<{
      fecha: string; monto: string; metodoPago: string; referencia: string;
    }[]>(
      `SELECT p.fecha::text, p.monto::text, p."metodoPago", COALESCE(p.referencia,'') AS referencia
       FROM pagos_cobrados p
       JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
       WHERE cxc."clienteId" = $1 AND cxc."empresaId" = $2 AND p."isActive" = true
       ORDER BY p.fecha DESC`,
      [id, empresaId],
    );

    const totalFacturado = facturas.reduce((s, f) => s + Number(f.total), 0);
    const totalCobrado   = cobros.reduce((s, c) => s + Number(c.monto), 0);
    const saldoPendiente = facturas.reduce((s, f) => s + Number(f.montoPendiente), 0);

    return {
      cliente: { id: cliente.id, nombre: cliente.nombre, rfc: cliente.rfc },
      periodo: { desde: fechaDesde ?? 'inicio', hasta: fechaHasta ?? 'hoy' },
      facturas: facturas.map(f => ({
        folio: f.folio, fecha: f.fecha, estado: f.estado,
        total: Number(f.total), montoPagado: Number(f.montoPagado),
        montoPendiente: Number(f.montoPendiente),
      })),
      cobros: cobros.map(c => ({
        fecha: c.fecha, monto: Number(c.monto),
        metodoPago: c.metodoPago, referencia: c.referencia,
      })),
      resumen: { totalFacturado, totalCobrado, saldoPendiente, cantidadFacturas: facturas.length },
    };
  }

  async generarEstadoCuentaPdf(data: any): Promise<{ buffer: Buffer; filename: string }> {
    const fmtM = (v: number) =>
      'RD$ ' + Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtD = (d: string) =>
      d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc    = new PDFKit({ size: 'A4', margin: 0, compress: true });
      const chunks: Buffer[] = [];
      doc.on('data',  c  => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW   = doc.page.width;
      const PH   = doc.page.height;
      const PL   = 36;
      const PR   = PW - 36;
      const W    = PR - PL;
      const BLUE = '#1a56db';
      const DARK = '#111111';
      const GRAY = '#555555';
      const r    = data.resumen ?? {};

      let y = 30;

      // ── Título / cliente ─────────────────────────────────────────────────────

      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
        .text('ESTADO DE CUENTA', PL, y);
      y += 13;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(17)
        .text(data.cliente?.nombre ?? 'Cliente', PL, y, { width: W * 0.65 });
      if (data.cliente?.rfc) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(9)
          .text('RNC/Cédula: ' + data.cliente.rfc, PL, y + 22, { width: W * 0.65 });
      }
      const periodoTxt =
        `Período: ${data.periodo?.desde === 'inicio' ? 'Todo' : fmtD(data.periodo?.desde)} — ${data.periodo?.hasta === 'hoy' ? 'Hoy' : fmtD(data.periodo?.hasta)}`;
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
        .text(periodoTxt, PL + W * 0.65, y, { width: W * 0.35, align: 'right' });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text('Generado: ' + new Date().toLocaleDateString('es-DO'), PL + W * 0.65, y + 13, { width: W * 0.35, align: 'right' });
      y += 38;

      // Separador azul
      doc.rect(PL, y, W, 3).fill(BLUE); y += 10;

      // ── Tarjetas resumen ─────────────────────────────────────────────────────

      const cardW = (W - 16) / 3;
      const cards = [
        { label: 'Total Facturado', value: fmtM(r.totalFacturado ?? 0), color: BLUE   },
        { label: 'Total Cobrado',   value: fmtM(r.totalCobrado ?? 0),   color: '#059669' },
        { label: 'Saldo Pendiente', value: fmtM(r.saldoPendiente ?? 0), color: (r.saldoPendiente ?? 0) > 0 ? '#dc2626' : '#059669' },
      ];
      cards.forEach((card, i) => {
        const cx = PL + i * (cardW + 8);
        doc.rect(cx, y, cardW, 40).fill('#f8fafc').stroke('#e2e8f0');
        doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(card.label, cx + 8, y + 7, { width: cardW - 16 });
        doc.fillColor(card.color).font('Helvetica-Bold').fontSize(13).text(card.value, cx + 8, y + 18, { width: cardW - 16 });
      });
      y += 52;

      // ── Tabla Facturas ───────────────────────────────────────────────────────

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
        .text(`FACTURAS (${r.cantidadFacturas ?? 0})`, PL, y); y += 12;

      const fCols = [
        { h: 'Folio',     w: 80,  a: 'left'  as const },
        { h: 'Fecha',     w: 65,  a: 'center' as const },
        { h: 'Estado',    w: 65,  a: 'center' as const },
        { h: 'Total',     w: 90,  a: 'right'  as const },
        { h: 'Cobrado',   w: 90,  a: 'right'  as const },
        { h: 'Pendiente', w: W - 80 - 65 - 65 - 90 - 90, a: 'right' as const },
      ];
      doc.rect(PL, y, W, 18).fill(BLUE);
      let hx = PL;
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
      fCols.forEach(c => {
        doc.text(c.h.toUpperCase(), hx + 3, y + 4, { width: c.w - 6, align: c.a });
        hx += c.w;
      });
      y += 18;

      const facturas: any[] = data.facturas ?? [];
      if (facturas.length === 0) {
        doc.rect(PL, y, W, 20).fill('#f9fafb');
        doc.fillColor(GRAY).font('Helvetica').fontSize(8).text('Sin facturas', PL, y + 6, { width: W, align: 'center' });
        y += 20;
      }
      facturas.forEach((f: any, idx: number) => {
        if (y + 18 > PH - 60) { doc.addPage(); y = 36; }
        doc.rect(PL, y, W, 18).fill(idx % 2 === 0 ? '#fff' : '#f8fafc')
          .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
        doc.lineWidth(1);
        let rx = PL;
        const cells = [
          { t: f.folio,                              w: fCols[0].w, a: 'left'  as const },
          { t: fmtD(f.fecha),                        w: fCols[1].w, a: 'center' as const },
          { t: (f.estado ?? '').toUpperCase(),        w: fCols[2].w, a: 'center' as const },
          { t: fmtM(f.total),                        w: fCols[3].w, a: 'right'  as const },
          { t: fmtM(f.montoPagado),                  w: fCols[4].w, a: 'right'  as const },
          { t: fmtM(f.montoPendiente),               w: fCols[5].w, a: 'right'  as const },
        ];
        cells.forEach(cell => {
          const isP = cell === cells[5] && Number(f.montoPendiente) > 0;
          doc.fillColor(isP ? '#dc2626' : DARK).font('Helvetica').fontSize(8)
            .text(cell.t, rx + 3, y + 4, { width: cell.w - 6, align: cell.a, ellipsis: true });
          rx += cell.w;
        });
        y += 18;
      });
      y += 10;

      // ── Tabla Cobros ─────────────────────────────────────────────────────────

      const cobros: any[] = data.cobros ?? [];
      if (cobros.length > 0) {
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
          .text(`COBROS (${cobros.length})`, PL, y); y += 12;

        const cCols = [
          { h: 'Fecha',      w: 80,  a: 'center' as const },
          { h: 'Método',     w: 110, a: 'left'   as const },
          { h: 'Referencia', w: W - 80 - 110 - 100, a: 'left' as const },
          { h: 'Monto',      w: 100, a: 'right'  as const },
        ];
        doc.rect(PL, y, W, 18).fill('#059669');
        hx = PL;
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
        cCols.forEach(c => {
          doc.text(c.h.toUpperCase(), hx + 3, y + 4, { width: c.w - 6, align: c.a });
          hx += c.w;
        });
        y += 18;

        cobros.forEach((c: any, idx: number) => {
          if (y + 18 > PH - 60) { doc.addPage(); y = 36; }
          doc.rect(PL, y, W, 18).fill(idx % 2 === 0 ? '#fff' : '#f0fdf4')
            .strokeColor('#e8e8e8').lineWidth(0.5).stroke();
          doc.lineWidth(1);
          let rx2 = PL;
          [
            { t: fmtD(c.fecha),    w: cCols[0].w, a: 'center' as const },
            { t: c.metodoPago,     w: cCols[1].w, a: 'left'   as const },
            { t: c.referencia||'—',w: cCols[2].w, a: 'left'   as const },
            { t: fmtM(c.monto),    w: cCols[3].w, a: 'right'  as const },
          ].forEach(cell => {
            doc.fillColor(cell === ([...[]].at(-1) as any) ? '#059669' : DARK).font('Helvetica').fontSize(8)
              .text(cell.t, rx2 + 3, y + 4, { width: cell.w - 6, align: cell.a, ellipsis: true });
            rx2 += cell.w;
          });
          y += 18;
        });
        y += 8;
      }

      // ── Footer ───────────────────────────────────────────────────────────────

      const fy = PH - 30;
      doc.moveTo(PL, fy).lineTo(PR, fy).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(7.5)
        .text('HiCloud ERP · Documento generado automáticamente', PL, fy + 8, { width: W / 2 });
      doc.text(new Date().toLocaleString('es-DO'), PR - W / 2, fy + 8, { width: W / 2, align: 'right' });

      doc.end();
    });

    return {
      buffer,
      filename: `Estado-Cuenta-${(data.cliente?.nombre ?? 'cliente').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
    };
  }
}
