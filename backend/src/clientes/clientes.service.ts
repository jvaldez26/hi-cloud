import {
  Injectable,
  NotFoundException,
  ConflictException,
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

@Injectable()
export class ClientesService {
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

    if (dto.rfc) {
      const existing = await this.clienteRepository.findOne({
        where: { rfc: dto.rfc, empresaId, isActive: true },
      });
      if (existing) throw new ConflictException(`RFC ${dto.rfc} ya está registrado en esta empresa`);
    }

    const cliente = this.clienteRepository.create({ ...dto, empresaId });
    const saved   = await this.clienteRepository.save(cliente);
    this.realtimeService.notify(empresaId, 'cliente', 'created', saved.id);
    return saved;
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
    if (!cliente) throw new NotFoundException(`Cliente con RFC ${rfc} no encontrado`);
    return cliente;
  }

  async update(id: number, dto: UpdateClienteDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const cliente   = await this.findOne(id);

    if (dto.rfc && dto.rfc !== cliente.rfc) {
      const rfcExists = await this.clienteRepository.findOne({
        where: { rfc: dto.rfc, empresaId, isActive: true },
      });
      if (rfcExists) throw new ConflictException(`RFC ${dto.rfc} ya está registrado`);
    }

    await this.clienteRepository.update(id, dto);
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
    const fmtM = (v: number) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtD = (d: string) => d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const COLOR = '#1a56db', GREEN = '#059669', RED = '#dc2626';

    const filasF = (data.facturas ?? []).map((f: any) => `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:7px 9px;font-size:11px;font-weight:600">${f.folio}</td>
      <td style="padding:7px 9px;font-size:11px">${fmtD(f.fecha)}</td>
      <td style="padding:7px 9px;font-size:10px"><span style="background:${f.estado==='pagada'?'#d1fae5':f.estado==='emitida'?'#dbeafe':'#fef3c7'};color:${f.estado==='pagada'?GREEN:f.estado==='emitida'?COLOR:'#d97706'};border-radius:3px;padding:2px 5px;font-weight:600">${f.estado.toUpperCase()}</span></td>
      <td style="padding:7px 9px;text-align:right;font-size:11px">${fmtM(f.total)}</td>
      <td style="padding:7px 9px;text-align:right;font-size:11px;color:${GREEN}">${fmtM(f.montoPagado)}</td>
      <td style="padding:7px 9px;text-align:right;font-size:11px;font-weight:700;color:${f.montoPendiente>0?RED:GREEN}">${fmtM(f.montoPendiente)}</td>
    </tr>`).join('');

    const filasC = (data.cobros ?? []).map((c: any) => `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:7px 9px;font-size:11px">${fmtD(c.fecha)}</td>
      <td style="padding:7px 9px;font-size:11px;text-transform:capitalize">${c.metodoPago}</td>
      <td style="padding:7px 9px;font-size:11px;color:#6b7280">${c.referencia || '—'}</td>
      <td style="padding:7px 9px;text-align:right;font-size:11px;font-weight:600;color:${GREEN}">${fmtM(c.monto)}</td>
    </tr>`).join('');

    const r = data.resumen ?? {};

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>* {box-sizing:border-box;margin:0;padding:0} body{font-family:'Inter',Arial,sans-serif;font-size:12px;color:#111;background:#fff} @page{margin:10mm 12mm}</style>
</head><body>
<div style="border-bottom:3px solid ${COLOR};padding-bottom:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <div style="font-size:9px;color:${COLOR};font-weight:700;text-transform:uppercase;letter-spacing:1px">Estado de Cuenta</div>
    <div style="font-size:18px;font-weight:800;color:#111;margin:3px 0">${data.cliente?.nombre ?? ''}</div>
    ${data.cliente?.rfc ? `<div style="font-size:11px;color:#6b7280">RNC/Cédula: ${data.cliente.rfc}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;font-weight:600;color:#111">Período: ${data.periodo?.desde === 'inicio' ? 'Todo' : fmtD(data.periodo?.desde)} — ${data.periodo?.hasta === 'hoy' ? 'Hoy' : fmtD(data.periodo?.hasta)}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:3px">Generado: ${new Date().toLocaleDateString('es-DO')}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px">
  <div style="background:#eff6ff;border-radius:6px;padding:10px 12px;border-left:3px solid ${COLOR}">
    <div style="font-size:10px;color:#6b7280;margin-bottom:3px">Total Facturado</div>
    <div style="font-size:15px;font-weight:800;color:${COLOR}">${fmtM(r.totalFacturado ?? 0)}</div>
  </div>
  <div style="background:#f0fdf4;border-radius:6px;padding:10px 12px;border-left:3px solid ${GREEN}">
    <div style="font-size:10px;color:#6b7280;margin-bottom:3px">Total Cobrado</div>
    <div style="font-size:15px;font-weight:800;color:${GREEN}">${fmtM(r.totalCobrado ?? 0)}</div>
  </div>
  <div style="background:${(r.saldoPendiente??0)>0?'#fef2f2':'#f0fdf4'};border-radius:6px;padding:10px 12px;border-left:3px solid ${(r.saldoPendiente??0)>0?RED:GREEN}">
    <div style="font-size:10px;color:#6b7280;margin-bottom:3px">Saldo Pendiente</div>
    <div style="font-size:15px;font-weight:800;color:${(r.saldoPendiente??0)>0?RED:GREEN}">${fmtM(r.saldoPendiente ?? 0)}</div>
  </div>
</div>
<div style="margin-bottom:18px">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#374151;letter-spacing:.4px;margin-bottom:6px;border-left:3px solid ${COLOR};padding-left:7px">Facturas (${r.cantidadFacturas ?? 0})</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    <thead><tr style="background:${COLOR}">
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Folio</th>
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Fecha</th>
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Estado</th>
      <th style="padding:7px 9px;text-align:right;color:#fff;font-size:9px">Total</th>
      <th style="padding:7px 9px;text-align:right;color:#fff;font-size:9px">Cobrado</th>
      <th style="padding:7px 9px;text-align:right;color:#fff;font-size:9px">Pendiente</th>
    </tr></thead>
    <tbody>${filasF || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#9ca3af">Sin facturas</td></tr>'}</tbody>
  </table>
</div>
${(data.cobros ?? []).length > 0 ? `
<div>
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#374151;letter-spacing:.4px;margin-bottom:6px;border-left:3px solid ${GREEN};padding-left:7px">Cobros (${(data.cobros??[]).length})</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    <thead><tr style="background:${GREEN}">
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Fecha</th>
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Método</th>
      <th style="padding:7px 9px;text-align:left;color:#fff;font-size:9px">Referencia</th>
      <th style="padding:7px 9px;text-align:right;color:#fff;font-size:9px">Monto</th>
    </tr></thead>
    <tbody>${filasC}</tbody>
  </table>
</div>` : ''}
<div style="margin-top:16px;padding-top:8px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
  <span>HiCloud ERP · Documento generado automáticamente</span>
  <span>${new Date().toLocaleString('es-DO')}</span>
</div>
</body></html>`;

    const puppeteer = await import('puppeteer');
    const browser   = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
      const buf = await page.pdf({ format: 'Letter', printBackground: true });
      return {
        buffer:   Buffer.from(buf),
        filename: `Estado-Cuenta-${(data.cliente?.nombre ?? 'cliente').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
      };
    } finally {
      await browser.close();
    }
  }
}
