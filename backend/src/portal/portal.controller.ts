import {
  Controller, Get, Param, Post,
  HttpCode, HttpStatus, NotFoundException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { Cliente } from '../clientes/entities/cliente.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { UseGuards } from '@nestjs/common';

@ApiTags('Portal del Cliente (Público)')
@Controller('portal')
export class PortalController {
  private readonly logger = new Logger(PortalController.name);

  constructor(
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    private dataSource: DataSource,
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

    const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
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
