import {
  Controller, Get, Post, Patch, Body, Param,
  HttpCode, HttpStatus, NotFoundException, Logger, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Repository, DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TicketSoporte, EstadoTicket, PrioridadTicket, CategoriaTicket } from './ticket-soporte.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { EmailService } from '../notificaciones/services/email.service';

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
    private dataSource: DataSource,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

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
    const cliente = await this.clienteRepository.findOne({
      where: { portalToken: token, isActive: true },
    });
    if (!cliente) throw new NotFoundException('Enlace de portal inválido o expirado');

    return {
      nombre:       cliente.nombre,
      rfc:          cliente.rfc,
      email:        cliente.email,
      ciudad:       cliente.ciudad,
      regimenFiscal: cliente.regimenFiscal,
    };
  }

  @Get(':token/facturas')
  @ApiOperation({ summary: 'Facturas del cliente (PÚBLICO con token)' })
  async getFacturasPortal(@Param('token') token: string) {
    const cliente = await this.validarToken(token);

    const facturas = await this.dataSource.query<{
      id: number; folio: string; fecha: string; estado: string;
      subtotal: string; iva: string; total: string;
    }[]>(
      `SELECT f.id, f.folio, f.fecha::text, f.estado,
              f.subtotal::text, f.iva::text, f.total::text
       FROM facturas f
       WHERE f."clienteId" = $1
         AND f."isActive" = true
         AND f.estado NOT IN ('borrador','cancelada')
       ORDER BY f.fecha DESC
       LIMIT 50`,
      [cliente.id],
    );

    return facturas.map(f => ({
      id:       f.id,
      folio:    f.folio,
      fecha:    f.fecha,
      estado:   f.estado,
      subtotal: Number(f.subtotal),
      iva:      Number(f.iva),
      total:    Number(f.total),
    }));
  }

  @Get(':token/estado-cuenta')
  @ApiOperation({ summary: 'Estado de cuenta del cliente (PÚBLICO con token)' })
  async getEstadoCuentaPortal(@Param('token') token: string) {
    const cliente = await this.validarToken(token);

    const [resumen] = await this.dataSource.query<{
      totalFacturado: string; totalCobrado: string; saldoPendiente: string; cantidad: string;
    }[]>(
      `SELECT
         COALESCE(SUM(f.total), 0)::text AS "totalFacturado",
         COALESCE(SUM(cxc."montoPagado"), 0)::text AS "totalCobrado",
         COALESCE(SUM(cxc."montoPendiente"), 0)::text AS "saldoPendiente",
         COUNT(f.id)::text AS cantidad
       FROM facturas f
       LEFT JOIN cuentas_por_cobrar cxc ON cxc."facturaId" = f.id
       WHERE f."clienteId" = $1
         AND f."isActive" = true
         AND f.estado NOT IN ('borrador','cancelada')`,
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

  // ── Gestión de tickets (requiere auth de empleado) ───────────────────────

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar todos los tickets de soporte (admin)' })
  async getAllTickets() {
    return this.ticketRepository.find({
      where: { isActive: true },
      order: { prioridad: 'ASC', createdAt: 'DESC' },
    });
  }

  @Patch('admin/tickets/:id/responder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Responder ticket y cambiar estado' })
  async responderTicket(@Param('id') id: string, @Body() dto: ResponderTicketDto) {
    const ticket = await this.ticketRepository.findOne({ where: { id: Number(id), isActive: true } });
    if (!ticket) throw new NotFoundException(`Ticket #${id} no encontrado`);
    await this.ticketRepository.update(Number(id), {
      respuesta:      dto.respuesta,
      fechaRespuesta: new Date(),
      estado:         dto.estado ?? EstadoTicket.RESUELTO,
    } as any);
    return this.ticketRepository.findOne({ where: { id: Number(id) } });
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
