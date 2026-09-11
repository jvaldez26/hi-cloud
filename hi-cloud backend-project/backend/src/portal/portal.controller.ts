import {
  Controller, Get, Post, Patch, Body, Param, Res,
  HttpCode, HttpStatus, NotFoundException, Logger, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Repository, DataSource } from 'typeorm';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TicketSoporte, EstadoTicket, PrioridadTicket, CategoriaTicket } from './ticket-soporte.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { PDFService } from '../facturas/services/pdf.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { EmailService } from '../notificaciones/services/email.service';
import { TenantService } from '../tenant/tenant.service';

class CreateTicketDto {
  @IsString()                       asunto!:      string;
  @IsString()                       descripcion!: string;
  @IsOptional() @IsEnum(CategoriaTicket) categoria?: CategoriaTicket;
  @IsOptional() @IsEnum(PrioridadTicket) prioridad?: PrioridadTicket;
}

class ResponderTicketDto {
  @IsString()  respuesta!: string;
  @IsOptional() @IsEnum(EstadoTicket) estado?: EstadoTicket;
}

@ApiTags('Portal del Cliente (Público)')
@Controller('portal')
export class PortalController {
  private readonly logger = new Logger(PortalController.name);

  constructor(
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    @InjectRepository(TicketSoporte)
    private ticketRepository: Repository<TicketSoporte>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    private dataSource: DataSource,
    private emailService: EmailService,
    private configService: ConfigService,
    private tenantService: TenantService,
    private pdfService: PDFService,
  ) {}

  // ── Gestión de tickets (ADMIN) — DEBEN ir ANTES de las rutas :token/* ───────
  // Express/NestJS matchea rutas en orden de definición; si :token/tickets se
  // define antes, 'admin' matchea como :token y el handler admin nunca se alcanza.

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar todos los tickets de soporte del tenant (admin)' })
  async getAllTickets() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.ticketRepository.find({
      where: { isActive: true, empresaId } as any,
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  @Patch('admin/tickets/:id/responder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Responder ticket y cambiar estado' })
  async responderTicket(@Param('id') id: string, @Body() dto: ResponderTicketDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const ticket = await this.ticketRepository.findOne({
      where: { id: Number(id), isActive: true, empresaId } as any,
    });
    if (!ticket) throw new NotFoundException(`Ticket #${id} no encontrado`);

    const estadoFinal = dto.estado ?? EstadoTicket.RESUELTO;
    await this.ticketRepository.update(Number(id), {
      respuesta:      dto.respuesta,
      fechaRespuesta: new Date(),
      estado:         estadoFinal,
    } as any);

    // Notificar al cliente por email si tiene correo registrado
    const cliente = await this.clienteRepository.findOne({
      where: { id: ticket.clienteId, isActive: true },
    });
    if (cliente?.email) {
      const estadoLabel: Record<string, string> = {
        en_proceso: 'En proceso', resuelto: 'Resuelto', cerrado: 'Cerrado',
      };
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://hicloudrd.com');
      const html = `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
          <h2 style="color:#1a56db">✅ Tu ticket ha sido respondido</h2>
          <p>Hola <strong>${cliente.nombre}</strong>,</p>
          <p>Tu ticket <strong>#${ticket.id} — ${ticket.asunto}</strong> fue atendido.</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0">
            <tr><td style="padding:6px;color:#555;width:110px">Estado:</td>
                <td style="padding:6px;font-weight:700">${estadoLabel[estadoFinal] ?? estadoFinal}</td></tr>
            <tr><td style="padding:6px;color:#555;vertical-align:top">Respuesta:</td>
                <td style="padding:6px;white-space:pre-wrap">${dto.respuesta}</td></tr>
          </table>
          <p style="margin-top:16px">
            <a href="${frontendUrl}/portal/${ticket.portalToken}" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
              Ver mi portal →
            </a>
          </p>
        </div>`;
      this.emailService.enviar({
        to: cliente.email,
        subject: `Re: [Ticket #${ticket.id}] ${ticket.asunto}`,
        html,
      }).catch((err: Error) => this.logger.warn(`Email respuesta ticket #${ticket.id} a cliente: ${err.message}`));
    }

    return this.ticketRepository.findOne({ where: { id: Number(id) } });
  }

  // ── Generar / obtener token del portal (requiere auth) ──────────────────────
  @Post('cliente/:clienteId/activar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Generar token de acceso al portal para un cliente (autenticado)' })
  async activarPortal(@Param('clienteId') clienteId: number) {
    const cliente = await this.clienteRepository.findOne({
      where: { id: Number(clienteId), isActive: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const ahora    = new Date();
    const expirado = !cliente.portalTokenExpiry || cliente.portalTokenExpiry < ahora;

    if (!cliente.portalToken || expirado) {
      const token    = randomBytes(32).toString('hex');
      const expiry   = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días
      await this.clienteRepository.update(Number(clienteId), {
        portalToken:       token,
        portalTokenExpiry: expiry,
      });
      cliente.portalToken       = token;
      cliente.portalTokenExpiry = expiry;
    }

    const baseUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
    return {
      token:     cliente.portalToken,
      portalUrl: `${baseUrl}/portal/${cliente.portalToken}`,
      expira:    cliente.portalTokenExpiry,
    };
  }

  // ── Endpoints PÚBLICOS — no requieren autenticación ───────────────────────
  @Get(':token')
  @ApiOperation({ summary: 'Obtener info del cliente por token de portal (PÚBLICO)' })
  async getClientePorToken(@Param('token') token: string) {
    // Pasa por `validarToken` como el resto. Antes miraba solo que el token
    // existiera, sin comprobar `portalTokenExpiry`: con un enlace caducado la
    // cabecera cargaba «Bienvenido, Fulano» y luego fallaba por dentro, cuando
    // el propio backend ya tenía preparado el mensaje que explica qué hacer.
    const cliente = await this.validarToken(token);

    // La empresa emisora. El portal se presentaba como «HiCloud ERP»: el
    // cliente entra a ver SUS facturas y lo recibe el nombre del ERP en vez del
    // de su proveedor.
    // Tabla `empresa`, en singular, y sin columna `razonSocial`: el nombre
    // comercial si lo hay y, si no, el legal.
    const [empresa] = await this.dataSource.query<{ nombre: string; rnc: string | null }[]>(
      `SELECT COALESCE(NULLIF("nombreComercial", ''), nombre) AS nombre, rnc
         FROM empresa WHERE id = $1 LIMIT 1`,
      [cliente.empresaId],
    );

    return {
      nombre:       cliente.nombre,
      rfc:          cliente.rfc,
      email:        cliente.email,
      ciudad:       cliente.ciudad,
      regimenFiscal: cliente.regimenFiscal,
      empresa: empresa ? { nombre: empresa.nombre, rnc: empresa.rnc } : null,
      // Para avisar antes de que el enlace deje de funcionar, en vez de que el
      // cliente se encuentre la puerta cerrada un día cualquiera.
      portalTokenExpiry: cliente.portalTokenExpiry ?? null,
    };
  }

  @Get(':token/facturas')
  @ApiOperation({ summary: 'Facturas del cliente (PÚBLICO con token)' })
  async getFacturasPortal(@Param('token') token: string) {
    const cliente = await this.validarToken(token);

    const LIMITE = 50;

    // `pendiente` por la misma regla que el estado de cuenta: la CxC si existe
    // y, si no, el estado de la factura. Es el dato que el cliente busca y la
    // tabla no lo tenía — solo el total, que en una factura a medio pagar no
    // dice nada.
    const facturas = await this.dataSource.query<{
      id: number; folio: string; fecha: string; estado: string;
      subtotal: string; iva: string; total: string;
      pendiente: string; fechaVencimiento: string | null;
    }[]>(
      `SELECT DISTINCT ON (f.id)
              f.id, f.folio, f.fecha::text, f.estado,
              f.subtotal::text, f.iva::text, f.total::text,
              f."fechaVencimiento"::text AS "fechaVencimiento",
              COALESCE(
                cxc."montoPendiente"::numeric,
                CASE WHEN f.estado = 'pagada' THEN 0 ELSE f.total::numeric END
              )::text AS pendiente
         FROM facturas f
         LEFT JOIN cuentas_por_cobrar cxc
                ON cxc."facturaId" = f.id AND cxc."isActive" = true
        WHERE f."clienteId" = $1
          AND f."isActive" = true
          AND f.estado NOT IN ('borrador','cancelada')
        ORDER BY f.id, cxc.id DESC
        LIMIT $2`,
      [cliente.id, LIMITE],
    );

    // Se ordena aquí: el DISTINCT ON obliga a ordenar por f.id en la consulta,
    // así que el orden por fecha que ve el cliente se aplica después.
    facturas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const [{ total: totalFacturas }] = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total FROM facturas
        WHERE "clienteId" = $1 AND "isActive" = true
          AND estado NOT IN ('borrador','cancelada')`,
      [cliente.id],
    );

    const hoy = new Date().toISOString().substring(0, 10);

    const items = facturas.map(f => {
      const pendiente = Number(f.pendiente);
      return {
        id:       f.id,
        folio:    f.folio,
        fecha:    f.fecha,
        estado:   f.estado,
        subtotal: Number(f.subtotal),
        iva:      Number(f.iva),
        total:    Number(f.total),
        pendiente,
        fechaVencimiento: f.fechaVencimiento,
        // Vencida = queda saldo y la fecha límite ya pasó. La pantalla la
        // pintaba igual que una al día, que es justo lo que no puede ser en un
        // portal de cobros.
        vencida: pendiente > 0.005 && !!f.fechaVencimiento && f.fechaVencimiento < hoy,
      };
    });

    // `total` y `mostradas` aparte: el LIMIT de 50 recortaba la lista en
    // silencio mientras el estado de cuenta sumaba TODAS las facturas. Un
    // cliente con más de 50 veía una lista incompleta sin saberlo y los totales
    // no le cuadraban con lo que tenía delante.
    return { items, total: Number(totalFacturas), mostradas: items.length, limite: LIMITE };
  }

  @Get(':token/estado-cuenta')
  @ApiOperation({ summary: 'Estado de cuenta del cliente (PÚBLICO con token)' })
  async getEstadoCuentaPortal(@Param('token') token: string) {
    const cliente = await this.validarToken(token);

    // El pendiente sale de la CxC cuando existe y, si no, del propio estado de
    // la factura.
    //
    // Antes esto era `SUM(cxc."montoPagado")` con un LEFT JOIN, y **una factura
    // de contado nunca genera CxC** —regla explícita de facturas.service—, así
    // que toda venta de contado contaba como cobro CERO. El cliente veía «te
    // facturamos X, has pagado RD$0.00, 0%» con cada línea diciendo PAGADA.
    //
    // Y mentía en las dos direcciones: una factura de contado EMITIDA y sin
    // cobrar tampoco tiene CxC, así que no sumaba pendiente y el portal le
    // decía «¡Estás al día!» a quien debe dinero. Ese era el lado caro.
    //
    // El DISTINCT ON protege de una factura con más de una fila en
    // cuentas_por_cobrar: sin él, el SUM(f.total) la contaría dos veces.
    const [resumen] = await this.dataSource.query<{
      totalFacturado: string; totalCobrado: string; saldoPendiente: string; cantidad: string;
    }[]>(
      `WITH por_factura AS (
         SELECT DISTINCT ON (f.id)
                f.id,
                f.total::numeric AS total,
                COALESCE(
                  cxc."montoPendiente"::numeric,
                  CASE WHEN f.estado = 'pagada' THEN 0 ELSE f.total::numeric END
                ) AS pendiente
           FROM facturas f
           LEFT JOIN cuentas_por_cobrar cxc
                  ON cxc."facturaId" = f.id AND cxc."isActive" = true
          WHERE f."clienteId" = $1
            AND f."isActive" = true
            AND f.estado NOT IN ('borrador','cancelada')
          ORDER BY f.id, cxc.id DESC
       )
       SELECT
         COALESCE(SUM(total), 0)::text                       AS "totalFacturado",
         GREATEST(COALESCE(SUM(total - pendiente), 0), 0)::text AS "totalCobrado",
         COALESCE(SUM(pendiente), 0)::text                   AS "saldoPendiente",
         COUNT(*)::text                                      AS cantidad
       FROM por_factura`,
      [cliente.id],
    );

    return {
      clienteNombre: cliente.nombre,
      totalFacturado: Number(resumen?.totalFacturado ?? 0),
      totalCobrado:   Number(resumen?.totalCobrado   ?? 0),
      saldoPendiente: Number(resumen?.saldoPendiente ?? 0),
      cantidadFacturas: Number(resumen?.cantidad ?? 0),
    };
  }

  // ── Tickets de Soporte (PÚBLICO con token) ───────────────────────────────

  @Post(':token/tickets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ticket de soporte desde el portal del cliente (PÚBLICO)' })
  async crearTicket(@Param('token') token: string, @Body() dto: CreateTicketDto) {
    const cliente = await this.validarToken(token);
    const ticket  = this.ticketRepository.create({
      ...dto,
      clienteId:     cliente.id,
      clienteNombre: cliente.nombre,
      portalToken:   token,
      estado:        EstadoTicket.ABIERTO,
      empresaId:     cliente.empresaId,
    });
    const saved = await this.ticketRepository.save(ticket);

    // Notificar al admin por email (no bloquear la respuesta si falla)
    const adminEmail = this.configService.get<string>('NOTIF_ADMIN_EMAIL', '');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'https://hicloudrd.com');
    if (adminEmail) {
      const prioridadLabel = { baja: 'Baja', media: 'Media', alta: 'Alta' }[saved.prioridad] ?? saved.prioridad;
      const categoriaLabel = {
        soporte_tecnico: 'Soporte Técnico', facturacion: 'Facturación',
        devolucion: 'Devolución', consulta: 'Consulta', otro: 'Otro',
      }[saved.categoria] ?? saved.categoria;
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#1a56db">🎫 Nuevo ticket de soporte</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px;color:#555;width:130px">Cliente:</td>
                <td style="padding:6px;font-weight:700">${saved.clienteNombre ?? '—'}</td></tr>
            <tr><td style="padding:6px;color:#555">Asunto:</td>
                <td style="padding:6px;font-weight:700">${saved.asunto}</td></tr>
            <tr><td style="padding:6px;color:#555">Categoría:</td>
                <td style="padding:6px">${categoriaLabel}</td></tr>
            <tr><td style="padding:6px;color:#555">Prioridad:</td>
                <td style="padding:6px"><strong style="color:${saved.prioridad === 'alta' ? '#dc2626' : saved.prioridad === 'media' ? '#d97706' : '#16a34a'}">${prioridadLabel}</strong></td></tr>
            <tr><td style="padding:6px;color:#555;vertical-align:top">Descripción:</td>
                <td style="padding:6px;white-space:pre-wrap">${saved.descripcion}</td></tr>
          </table>
          <p style="margin-top:20px">
            <a href="${frontendUrl}/soporte/tickets" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
              Ver y responder en el panel →
            </a>
          </p>
        </div>`;
      this.emailService.enviar({
        to: adminEmail,
        subject: `[Ticket #${saved.id}] ${saved.asunto} — ${saved.clienteNombre ?? 'Cliente'}`,
        html,
      }).catch((err: Error) => this.logger.warn(`Email ticket #${saved.id}: ${err.message}`));
    }

    return saved;
  }

  @Get(':token/tickets')
  @ApiOperation({ summary: 'Listar tickets del cliente (PÚBLICO con token)' })
  async getTicketsCliente(@Param('token') token: string) {
    const cliente = await this.validarToken(token);
    return this.ticketRepository.find({
      where: { clienteId: cliente.id, empresaId: cliente.empresaId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  @Get(':token/facturas/:id/pdf')
  @ApiOperation({ summary: 'Descargar PDF de factura desde el portal del cliente (PÚBLICO con token)' })
  async descargarPDFPortal(
    @Param('token') token: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const cliente = await this.validarToken(token);

    const factura = await this.facturaRepository.findOne({
      where: {
        id:          Number(id),
        clienteId:   cliente.id,
        empresaId:   cliente.empresaId,
        isActive:    true,
      },
      relations: ['detalles', 'cliente', 'usuario'],
    });
    if (!factura) throw new NotFoundException(`Factura #${id} no encontrada o no pertenece a este cliente`);

    const { buffer, filename } = await this.pdfService.generarPDFDesdeEntidad(factura, cliente.empresaId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  private async validarToken(token: string): Promise<Cliente> {
    const cliente = await this.clienteRepository.findOne({
      where: { portalToken: token, isActive: true },
    });
    if (!cliente) throw new NotFoundException('Enlace de portal inválido o expirado');
    if (cliente.portalTokenExpiry && cliente.portalTokenExpiry < new Date()) {
      throw new NotFoundException('El enlace del portal ha expirado. Solicita un nuevo enlace a tu proveedor.');
    }
    return cliente;
  }
}
