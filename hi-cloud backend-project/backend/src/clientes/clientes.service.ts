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

/**
 * Traduce el 23505 del índice único a un mensaje entendible.
 *
 * El RNC repetido YA NO es un error: varias escuelas de un mismo distrito
 * educativo facturan bajo el mismo RNC y son clientes distintos. Lo que sigue
 * bloqueado es el duplicado real — mismo RNC Y mismo nombre, entre activos.
 */
function handleClienteDuplicate(err: any, rfc?: string, nombre?: string): never {
  const esDuplicado =
    err?.code === '23505' ||
    err?.message?.includes('duplicate key') ||
    err?.message?.includes('ya existe');

  if (esDuplicado) {
    throw new ConflictException(
      nombre
        ? `Ya existe un cliente activo llamado "${nombre}"${rfc ? ` con RNC/Cédula ${rfc}` : ''}. ` +
          'Si es un cliente distinto que comparte el RNC, dale un nombre que lo diferencie.'
        : 'Ya existe un cliente activo con ese mismo RNC/Cédula y nombre en su empresa',
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

  /**
   * Clientes activos que ya usan este RNC/Cédula en la empresa actual.
   *
   * Alimenta la alerta NO BLOQUEANTE al guardar: compartir RNC es legítimo
   * (escuelas de un mismo distrito educativo), así que en vez de rechazar se
   * muestra quiénes son para que el usuario elija uno existente si aplica.
   * Devuelve dirección y contacto porque un RNC repetido sin más contexto no
   * permite distinguir entre las opciones.
   */
  async buscarPorRnc(rnc: string, excluirId?: number) {
    const empresaId  = this.tenantService.getEmpresaId();
    const rncLimpio  = (rnc ?? '').replace(/\D/g, '');
    if (!rncLimpio) return { rnc: '', total: 0, clientes: [] };

    const qb = this.clienteRepository
      .createQueryBuilder('cliente')
      .select([
        'cliente.id', 'cliente.nombre', 'cliente.razonSocial', 'cliente.rfc',
        'cliente.rncReceptor', 'cliente.direccion', 'cliente.ciudad',
        'cliente.telefono', 'cliente.email',
      ])
      .where('cliente.empresaId = :empresaId', { empresaId })
      .andWhere('cliente.isActive = :active', { active: true })
      .andWhere('(cliente.rfc = :rnc OR cliente.rncReceptor = :rnc)', { rnc: rncLimpio })
      .orderBy('cliente.nombre', 'ASC');

    if (excluirId) qb.andWhere('cliente.id != :excluirId', { excluirId });

    const clientes = await qb.getMany();
    return { rnc: rncLimpio, total: clientes.length, clientes };
  }

  async create(dto: CreateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteClientes(empresaId);

    // Se calcula ANTES de insertar para que el aviso no incluya al recién creado
    const previos = dto.rfc ? await this.buscarPorRnc(dto.rfc) : null;

    const cliente = this.clienteRepository.create({ ...dto, empresaId });
    try {
      const saved = await this.clienteRepository.save(cliente);
      this.realtimeService.notify(empresaId, 'cliente', 'created', saved.id);

      // Aviso, no error: el cliente ya quedó guardado. Sirve para el caso en que
      // el usuario creó desde un formulario que no consultó /clientes/rnc antes.
      if (previos && previos.total > 0) {
        return {
          ...saved,
          avisoRncCompartido: {
            total:    previos.total,
            clientes: previos.clientes,
            mensaje:  `Ya existe${previos.total === 1 ? '' : 'n'} ${previos.total} ` +
                      `cliente${previos.total === 1 ? '' : 's'} con este RNC`,
          },
        };
      }
      return saved;
    } catch (err: unknown) {
      handleClienteDuplicate(err, dto.rfc, dto.nombre);
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
        '(cliente.nombre ILIKE :s OR cliente.rfc ILIKE :s OR cliente.razonSocial ILIKE :s ' +
        ' OR cliente.rncReceptor ILIKE :s OR cliente.direccion ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('cliente.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Marca qué clientes comparten RNC con otro de la misma empresa. Los
    // selectores lo usan para mostrar dirección y desambiguar: un cajero que ve
    // cinco veces el mismo RNC sin más contexto no puede elegir bien.
    const rncsCompartidos = await this.rncsCompartidos(empresaId);
    const conMarca = data.map(c => ({
      ...c,
      rncCompartido: !!c.rfc && rncsCompartidos.has(c.rfc),
    }));

    return {
      data: conMarca,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** RNC que más de un cliente activo usa dentro de la empresa */
  private async rncsCompartidos(empresaId: number): Promise<Set<string>> {
    const rows = await this.dataSource.query<{ rfc: string }[]>(
      `SELECT rfc
         FROM clientes
        WHERE "empresaId" = $1 AND "isActive" = true AND rfc IS NOT NULL AND rfc <> ''
        GROUP BY rfc
       HAVING COUNT(*) > 1`,
      [empresaId],
    );
    return new Set(rows.map(r => r.rfc));
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente = await this.clienteRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente #${id} no encontrado`);
    return cliente;
  }

  /**
   * Un solo cliente por RNC — se mantiene por compatibilidad con integraciones
   * existentes. Desde que varios clientes pueden compartir RNC (escuelas de un
   * distrito), esto devuelve el más antiguo de forma determinista y avisa de
   * los demás en `otrosConMismoRnc`. Para elegir entre varios usa buscarPorRnc().
   */
  async findByRfc(rfc: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const clientes = await this.clienteRepository.find({
      where: { rfc, empresaId, isActive: true },
      order: { id: 'ASC' },
    });
    if (clientes.length === 0) {
      throw new NotFoundException(`Cliente con RNC/Cédula ${rfc} no encontrado`);
    }
    if (clientes.length > 1) {
      this.logger.warn(
        `RNC ${rfc} (empresa ${empresaId}) lo comparten ${clientes.length} clientes; ` +
        `findByRfc devuelve el #${clientes[0].id}. Usar /clientes/rnc/:rnc para elegir.`,
      );
      return { ...clientes[0], otrosConMismoRnc: clientes.length - 1 };
    }
    return clientes[0];
  }

  async update(id: number, dto: UpdateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const actual    = await this.findOne(id); // valida que existe en este tenant

    try {
      await this.clienteRepository.update(id, dto);
    } catch (err: unknown) {
      handleClienteDuplicate(err, dto.rfc ?? actual.rfc, dto.nombre ?? actual.nombre);
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

    const facturasParams: unknown[] = [id, empresaId];
    let fechaWhere = '';
    if (fechaDesde) { fechaWhere += ` AND f.fecha >= $${facturasParams.push(fechaDesde)}`; }
    if (fechaHasta) { fechaWhere += ` AND f.fecha <= $${facturasParams.push(fechaHasta)}`; }

    const facturasRaw = await this.dataSource.query<{
      folio: string; fecha: string; estado: string; moneda: string;
      total: string; montoPagado: string; montoPendiente: string;
    }[]>(
      `SELECT f.folio, f.fecha::text, f.estado,
              COALESCE(f.moneda, 'DOP') AS moneda,
              f.total::text,
              CASE
                WHEN cxc."montoPagado"   IS NOT NULL THEN cxc."montoPagado"
                WHEN f.estado = 'pagada'             THEN f.total
                ELSE 0
              END::text AS "montoPagado",
              CASE
                WHEN cxc."montoPendiente" IS NOT NULL THEN cxc."montoPendiente"
                WHEN f.estado = 'pagada'              THEN 0
                ELSE f.total
              END::text AS "montoPendiente"
       FROM facturas f
       LEFT JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = f.id
       WHERE f."clienteId" = $1 AND f."empresaId" = $2 AND f."isActive" = true
         AND f.estado NOT IN ('borrador','cancelada')${fechaWhere}
       ORDER BY f.fecha DESC`,
      facturasParams,
    );

    const cobrosRaw = await this.dataSource.query<{
      fecha: string; monto: string; metodoPago: string; referencia: string; moneda: string;
    }[]>(
      `SELECT p.fecha::text, p.monto::text, p."metodoPago",
              COALESCE(p.referencia,'') AS referencia,
              COALESCE(p.moneda, 'DOP') AS moneda
       FROM pagos_cobrados p
       JOIN cuentas_por_cobrar cxc ON cxc.id = p."cuentaPorCobrarId"
       WHERE cxc."clienteId" = $1 AND cxc."empresaId" = $2 AND p."isActive" = true
       ORDER BY p.fecha DESC`,
      [id, empresaId],
    );

    // Resumen separado por moneda
    const resumenPorMoneda: Record<string, {
      totalFacturado: number; totalCobrado: number; saldoPendiente: number; cantidadFacturas: number;
    }> = {};

    for (const f of facturasRaw) {
      const m = f.moneda ?? 'DOP';
      if (!resumenPorMoneda[m]) resumenPorMoneda[m] = { totalFacturado: 0, totalCobrado: 0, saldoPendiente: 0, cantidadFacturas: 0 };
      resumenPorMoneda[m].totalFacturado  += Number(f.total);
      resumenPorMoneda[m].totalCobrado    += Number(f.montoPagado);
      resumenPorMoneda[m].saldoPendiente  += Number(f.montoPendiente);
      resumenPorMoneda[m].cantidadFacturas++;
    }

    // resumen legacy (solo DOP) para compatibilidad con PDF
    const rDOP = resumenPorMoneda['DOP'] ?? { totalFacturado: 0, totalCobrado: 0, saldoPendiente: 0, cantidadFacturas: 0 };

    return {
      cliente: { id: cliente.id, nombre: cliente.nombre, rfc: cliente.rfc },
      periodo: { desde: fechaDesde ?? 'inicio', hasta: fechaHasta ?? 'hoy' },
      facturas: facturasRaw.map(f => ({
        folio: f.folio, fecha: f.fecha, estado: f.estado, moneda: f.moneda ?? 'DOP',
        total: Number(f.total), montoPagado: Number(f.montoPagado),
        montoPendiente: Number(f.montoPendiente),
      })),
      cobros: cobrosRaw.map(c => ({
        fecha: c.fecha, monto: Number(c.monto),
        metodoPago: c.metodoPago, referencia: c.referencia, moneda: c.moneda ?? 'DOP',
      })),
      resumen:          { ...rDOP },
      resumenPorMoneda,
    };
  }

  async generarEstadoCuentaPdf(data: any): Promise<{ buffer: Buffer; filename: string }> {
    const fmtMoney = (v: number, moneda = 'DOP') => {
      const sym = moneda === 'USD' ? 'US$' : moneda === 'EUR' ? '€' : 'RD$';
      return `${sym} ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
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

      const resumenPorMoneda: Record<string, any> = data.resumenPorMoneda ?? { DOP: data.resumen ?? {} };
      const monedas = Object.keys(resumenPorMoneda);
      const totalFacturasCount = (data.facturas ?? []).length;

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

      // ── Tarjetas resumen (una fila por moneda) ───────────────────────────────

      for (const m of monedas) {
        const r = resumenPorMoneda[m];
        const cardW = (W - 16) / 3;
        const monedaLabel = m === 'DOP' ? 'Pesos (DOP)' : m === 'USD' ? 'Dólares (USD)' : m;
        doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(monedaLabel, PL, y); y += 9;
        const cards = [
          { label: 'Total Facturado', value: fmtMoney(r.totalFacturado ?? 0, m), color: BLUE },
          { label: 'Total Cobrado',   value: fmtMoney(r.totalCobrado   ?? 0, m), color: '#059669' },
          { label: 'Saldo Pendiente', value: fmtMoney(r.saldoPendiente ?? 0, m), color: (r.saldoPendiente ?? 0) > 0 ? '#dc2626' : '#059669' },
        ];
        cards.forEach((card, i) => {
          const cx = PL + i * (cardW + 8);
          doc.rect(cx, y, cardW, 40).fill('#f8fafc').stroke('#e2e8f0');
          doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(card.label, cx + 8, y + 7, { width: cardW - 16 });
          doc.fillColor(card.color).font('Helvetica-Bold').fontSize(12).text(card.value, cx + 8, y + 19, { width: cardW - 16 });
        });
        y += 48;
      }
      y += 4;

      // ── Tabla Facturas ───────────────────────────────────────────────────────

      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
        .text(`FACTURAS (${totalFacturasCount})`, PL, y); y += 12;

      const fCols = [
        { h: 'Folio',     w: 75,  a: 'left'   as const },
        { h: 'Fecha',     w: 60,  a: 'center'  as const },
        { h: 'Estado',    w: 60,  a: 'center'  as const },
        { h: 'Moneda',    w: 42,  a: 'center'  as const },
        { h: 'Total',     w: 85,  a: 'right'   as const },
        { h: 'Cobrado',   w: 85,  a: 'right'   as const },
        { h: 'Pendiente', w: W - 75 - 60 - 60 - 42 - 85 - 85, a: 'right' as const },
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
        const fMon = (f.moneda as string) ?? 'DOP';
        const cells = [
          { t: f.folio,                         w: fCols[0].w, a: 'left'   as const },
          { t: fmtD(f.fecha),                   w: fCols[1].w, a: 'center' as const },
          { t: (f.estado ?? '').toUpperCase(),   w: fCols[2].w, a: 'center' as const },
          { t: fMon,                             w: fCols[3].w, a: 'center' as const },
          { t: fmtMoney(f.total, fMon),          w: fCols[4].w, a: 'right'  as const },
          { t: fmtMoney(f.montoPagado, fMon),    w: fCols[5].w, a: 'right'  as const },
          { t: fmtMoney(f.montoPendiente, fMon), w: fCols[6].w, a: 'right'  as const },
        ];
        cells.forEach((cell, ci) => {
          const isP = ci === 6 && Number(f.montoPendiente) > 0;
          const isUSD = ci === 3 && fMon !== 'DOP';
          doc.fillColor(isP ? '#dc2626' : isUSD ? '#b45309' : DARK).font('Helvetica').fontSize(8)
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
            { t: fmtMoney(c.monto, c.moneda ?? 'DOP'), w: cCols[3].w, a: 'right' as const },
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
