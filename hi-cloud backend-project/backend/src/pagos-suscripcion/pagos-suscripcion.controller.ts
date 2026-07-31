import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe,
  UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage }   from 'multer';
import { JwtAuthGuard }    from '../auth/guards/jwt-auth.guard';
import { RolesGuard }      from '../auth/guards/roles.guard';
import { GetUser }         from '../auth/decorators/get-user.decorator';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { SuperAdminService } from '../super-admin/super-admin.service';
import { PagosSuscripcionService } from './pagos-suscripcion.service';
import {
  RegistrarPagoDto, ConfirmarPagoDto, RechazarPagoDto,
  AgregarCargoDto, AplicarCreditoDto,
  UpdateConfiguracionBancariaDto,
  SubirComprobanteDto,
} from './dto/pagos-suscripcion.dto';

// ── CLIENTE (empresa) ─────────────────────────────────────────────────────────

@Controller('pagos-suscripcion')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PagosSuscripcionController {
  constructor(private svc: PagosSuscripcionService) {}

  /** GET /pagos-suscripcion/resumen — plan + días + saldo pendiente */
  @Get('resumen')
  getMiResumen() {
    return this.svc.getMiResumen();
  }

  /** GET /pagos-suscripcion/historial — historial de cargos y pagos */
  @Get('historial')
  getHistorial() {
    return this.svc.getHistorialCliente();
  }

  /** GET /pagos-suscripcion/configuracion-bancaria — datos para transferencia */
  @Get('configuracion-bancaria')
  getConfiguracionBancaria() {
    return this.svc.getConfiguracionBancaria();
  }

  /**
   * POST /pagos-suscripcion/comprobante — subir comprobante de transferencia
   * multipart/form-data: file + monto + referencia? + banco? + notas?
   */
  @Post('comprobante')
  @UseInterceptors(FileInterceptor('file', {
    storage:  memoryStorage(),
    limits:   { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new BadRequestException('Solo se permiten imágenes (JPG, PNG, WEBP) o PDF'), false);
      }
      cb(null, true);
    },
  }))
  async subirComprobante(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body() body: SubirComprobanteDto,
  ) {
    if (!file) throw new BadRequestException('Se requiere un archivo comprobante');
    return this.svc.subirComprobante(
      file,
      Number(body.monto),
      body.referencia,
      body.banco,
      body.notas,
    );
  }
}

// ── SUPER ADMIN ───────────────────────────────────────────────────────────────

@Controller('admin/pagos-suscripcion')
@UseGuards(SuperAdminGuard)
export class PagosSuscripcionAdminController {
  constructor(
    private svc: PagosSuscripcionService,
    private superAdminSvc: SuperAdminService,
  ) {}

  /** GET /admin/pagos-suscripcion — todos los pagos (filtrable por estado) */
  @Get()
  listarPagos(@Query('estado') estado?: string) {
    return this.svc.listarPagosAdmin(estado);
  }

  /** GET /admin/pagos-suscripcion/resumen-cobros — panel con saldo por empresa */
  @Get('resumen-cobros')
  resumenCobros() {
    return this.svc.resumenCobros();
  }

  /** GET /admin/pagos-suscripcion/comprobantes-pendientes */
  @Get('comprobantes-pendientes')
  comprobantesPendientes() {
    return this.svc.listarComprobantesPeridentes();
  }

  /** GET /admin/pagos-suscripcion/empresa/:id */
  @Get('empresa/:id')
  historialEmpresa(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHistorialEmpresa(id);
  }

  /** POST /admin/pagos-suscripcion/empresa/:id/pago */
  @Post('empresa/:id/pago')
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoDto,
    @GetUser('id') adminId: number,
  ) {
    return this.svc.registrarPago(id, dto, adminId);
  }

  /** POST /admin/pagos-suscripcion/empresa/:id/cargo */
  @Post('empresa/:id/cargo')
  agregarCargo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarCargoDto,
    @GetUser('id') adminId: number,
  ) {
    return this.svc.agregarCargo(id, dto, adminId);
  }

  /** POST /admin/pagos-suscripcion/empresa/:id/credito */
  @Post('empresa/:id/credito')
  aplicarCredito(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AplicarCreditoDto,
    @GetUser('id') adminId: number,
  ) {
    return this.svc.aplicarCredito(id, dto, adminId);
  }

  /** PATCH /admin/pagos-suscripcion/:pagoId/confirmar */
  @Patch(':pagoId/confirmar')
  confirmarTransferencia(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Body() dto: ConfirmarPagoDto,
    @GetUser('id') adminId: number,
  ) {
    return this.svc.confirmarTransferencia(pagoId, adminId, dto);
  }

  /** PATCH /admin/pagos-suscripcion/:pagoId/rechazar */
  @Patch(':pagoId/rechazar')
  rechazarTransferencia(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Body() dto: RechazarPagoDto,
    @GetUser('id') adminId: number,
  ) {
    return this.svc.rechazarTransferencia(pagoId, adminId, dto);
  }

  /** POST /admin/pagos-suscripcion/empresa/:id/recordatorio */
  @Post('empresa/:id/recordatorio')
  enviarRecordatorio(@Param('id', ParseIntPipe) id: number) {
    return this.svc.enviarRecordatorio(id);
  }

  /** GET /admin/pagos-suscripcion/config-bancaria */
  @Get('config-bancaria')
  getConfigBancaria() {
    return this.svc.getConfiguracionBancaria();
  }

  /** PATCH /admin/pagos-suscripcion/config-bancaria */
  @Patch('config-bancaria')
  async updateConfigBancaria(
    @Body() dto: UpdateConfiguracionBancariaDto,
    @GetUser('id') adminId: number,
  ) {
    // S-64: es la cuenta a la que los clientes transfieren las suscripciones.
    // Cambiarla desviaría los cobros y no dejaba ningún rastro de quién lo hizo.
    const antes = await this.svc.getConfiguracionBancaria();
    const res   = await this.svc.updateConfiguracionBancaria(dto);
    await this.superAdminSvc.auditarCambioConfigBancaria(
      antes ? { ...(antes as any) } : null,
      { ...dto },
      adminId,
    );
    return res;
  }
}
