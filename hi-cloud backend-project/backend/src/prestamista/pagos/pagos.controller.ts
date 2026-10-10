import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { RequiereSupervisor } from '../../supervisor-politicas/guards/requiere-supervisor.guard';
import { TenantService } from '../../tenant/tenant.service';
import { EmailService } from '../../notificaciones/services/email.service';
import { PagosService } from './pagos.service';
import { PrestamistaPdfService } from '../pdf/prestamista-pdf.service';
import { RegistrarPagoDto, EnviarReciboCorreoDto } from '../dto/prestamista.dto';
import { r2 } from '../utils/mora.util';

/** Pago retroactivo: fecha anterior a hoy — ver supervisor-catalogo.ts clave 'pago_retroactivo'. */
function esPagoRetroactivo(body: any): boolean {
  if (!body?.fecha) return false;
  const hoy = new Date().toISOString().slice(0, 10);
  return String(body.fecha) < hoy;
}

@Controller('prestamista/pagos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Pagos')
@ApiBearerAuth()
export class PagosController {
  constructor(
    private readonly svc: PagosService,
    private readonly tenantSvc: TenantService,
    private readonly pdfSvc: PrestamistaPdfService,
    private readonly emailSvc: EmailService,
  ) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get('prestamo/:prestamoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findByPrestamo(@Param('prestamoId', ParseIntPipe) id: number) {
    return this.svc.findByPrestamo(this.empresaId, id);
  }
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(this.empresaId, id);
  }
  // Vista previa: mismo cálculo que registrar(), nunca persiste.
  @Post('preview')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  preview(@Body() body: RegistrarPagoDto) { return this.svc.preview(this.empresaId, body); }

  // Registrar pago: operador básico o superior. Con fecha anterior a hoy,
  // exige autorización de supervisor (solo le aplica a rol vendedor — ver
  // RequiereSupervisor, igual que el resto de las políticas del POS).
  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @UseGuards(RequiereSupervisor('pago_retroactivo', { soloSi: esPagoRetroactivo }))
  registrar(@Body() body: RegistrarPagoDto) { return this.svc.registrar(this.empresaId, body); }

  // Link wa.me para compartir el recibo — igual que el resto del ERP
  // (WhatsAppButton.tsx + comunicaciones.controller.ts), pero self-contained
  // en el propio módulo para no acoplarlo con comunicaciones.service.ts
  // (fuera del alcance de Prestamista en esta etapa). No hay proveedor de
  // WhatsApp Business activado — es el mismo mecanismo manual del resto del ERP.
  @Get(':id/whatsapp')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  async whatsapp(@Param('id', ParseIntPipe) id: number) {
    const pago = await this.pdfSvc.buscarPagoParaRecibo(id, this.empresaId);
    if (!pago) throw new NotFoundException(`Pago #${id} no encontrado`);
    const empresaNombre = pago.empresaNombre ?? 'HiCloud ERP';
    const texto = [
      `Estimado/a *${pago.deudorNombre}*,`,
      '',
      `Le confirmamos la recepción de su pago *${pago.numero}* del préstamo *${pago.prestamoNumero}*.`,
      '',
      `💰 Monto: *RD$ ${r2(pago.montoPagado).toFixed(2)}*`,
      `📅 Fecha: *${new Date(pago.fecha).toLocaleDateString('es-DO')}*`,
      '',
      `Gracias por su pago.`,
      '',
      `_${empresaNombre}_`,
    ].join('\n');
    const numero = String(pago.deudorTelefono ?? '').replace(/\D/g, '');
    const link = numero
      ? `https://wa.me/${numero.startsWith('1') ? '' : '1809'}${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    return { texto, link, numero: numero || undefined };
  }

  // Recibo por correo: mismo PDF que /pdf/recibo/:id, adjunto en vez de descargado.
  @Post(':id/enviar-recibo')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  async enviarRecibo(@Param('id', ParseIntPipe) id: number, @Body() body: EnviarReciboCorreoDto) {
    const recibo = await this.pdfSvc.reciboPagoBuffer(id, this.empresaId);
    if (!recibo) throw new NotFoundException(`Pago #${id} no encontrado`);
    const empresaNombre = recibo.pago.empresaNombre ?? 'HiCloud';
    return this.emailSvc.enviar({
      to: body.email, cc: body.cc, bcc: body.cco,
      subject: `Recibo de pago ${recibo.pago.numero} — ${empresaNombre}`,
      html: `<p>Adjunto el recibo del pago <b>${recibo.pago.numero}</b> por RD$ ${r2(recibo.pago.montoPagado).toFixed(2)}.</p>
             <p style="color:#888;font-size:12px">Generado por HiCloud.</p>`,
      attachments: [{ filename: recibo.filename, content: recibo.buffer, contentType: 'application/pdf' }],
    });
  }
}
