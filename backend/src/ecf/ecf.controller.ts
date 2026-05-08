import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ECFService } from './ecf.service';
import { ReintentoECFJob } from './jobs/reintento-ecf.job';
import { CreateSecuenciaECFDto } from './dto/create-secuencia-ecf.dto';
import { UpdateEstadoECFDto } from './dto/update-estado-ecf.dto';
import { FiltroECFDto } from './dto/filtro-ecf.dto';
import { CreateProveedorECFDto } from './dto/create-proveedor-ecf.dto';
import { UpdateProveedorECFDto } from './dto/update-proveedor-ecf.dto';
import { EmitirEcfNotaDebitoDto, EmitirEcfNotaCreditoDto } from './dto/emitir-nota-ecf.dto';
import { EmitirEcfCompraDto, EmitirEcfGastoDto, EmitirEcfPagoExteriorDto } from './dto/emitir-compra-ecf.dto';
import { EmitirECFUseCase } from './use-cases/emitir-ecf.use-case';
import { DocumentoOrigenTipo } from './entities/ecf.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

@ApiTags('e-CF (Comprobantes Fiscales Electrónicos)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('ecf')
@Controller('ecf')
export class ECFController {
  constructor(
    private ecfService:     ECFService,
    private emitirUseCase:  EmitirECFUseCase,
    private reintentoJob:   ReintentoECFJob,
  ) {}

  // ── Tipos ──────────────────────────────────────────────────────────

  @Get('tipos')
  @ApiOperation({ summary: 'Listar todos los tipos de e-CF DGII (E31–E47)' })
  getTipos() {
    return this.ecfService.getTipos();
  }

  // ── Secuencias ─────────────────────────────────────────────────────

  @Get('secuencias')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar secuencias autorizadas por la DGII' })
  getSecuencias(@Query() pagination: PaginationDto) {
    return this.ecfService.getSecuencias(pagination);
  }

  @Post('secuencias')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar nueva secuencia autorizada por DGII (solo ADMIN)' })
  createSecuencia(
    @Body() dto: CreateSecuenciaECFDto,
    @GetUser() usuario: User,
  ) {
    return this.ecfService.createSecuencia(dto, usuario.id);
  }

  @Get('secuencias/resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen de secuencias por tipo e-CF con porcentaje de uso' })
  getResumenSecuencias() {
    return this.ecfService.getResumenSecuencias();
  }

  @Get('secuencias/proximas-vencer')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Secuencias con ≥85% uso, ≤50 disponibles o vencen en ≤30 días' })
  getSecuenciasProximasVencer() {
    return this.ecfService.getSecuenciasProximasVencer();
  }

  @Patch('secuencias/:id/desactivar')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar una secuencia (solo ADMIN)' })
  desactivarSecuencia(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() usuario: User,
  ) {
    return this.ecfService.desactivarSecuencia(id, usuario.id);
  }

  @Get('estadisticas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Estadísticas de e-CFs por tipo (opcional: ?mes=5&anio=2026)' })
  getEstadisticas(
    @Query('mes')  mes?: string,
    @Query('anio') anio?: string,
  ) {
    return this.ecfService.getEstadisticasPorTipo(
      mes  ? Number(mes)  : undefined,
      anio ? Number(anio) : undefined,
    );
  }

  // ── Tipo e-CF sugerido por tipo de cliente ─────────────────────────

  @Get('tipo-sugerido/:tipoCliente')
  @ApiOperation({ summary: 'Obtener el tipo de e-CF sugerido según el tipo de cliente (E31/E32/E44/E45/E46)' })
  getTipoSugerido(@Param('tipoCliente') tipoCliente: string) {
    const mapa: Record<string, string> = {
      persona_juridica:  'E31',
      persona_fisica:    'E31',
      consumidor_final:  'E32',
      extranjero:        'E46',
      regimen_especial:  'E44',
      gubernamental:     'E45',
    };
    return { tipoNcf: mapa[tipoCliente] ?? 'E32' };
  }

  // ── e-CFs ──────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar e-CFs con filtros opcionales (?estado=&tipo=E31&fecha=2026-05)' })
  getECFs(@Query() filtro: FiltroECFDto) {
    return this.ecfService.getECFs(filtro);
  }

  @Get('pendientes')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'e-CFs pendientes de respuesta del proveedor' })
  getPendientes() {
    return this.ecfService.getECFsPendientes();
  }

  @Get('rechazados')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'e-CFs rechazados disponibles para reenvío' })
  getRechazados() {
    return this.ecfService.getECFsRechazados();
  }

  // ── Emisión de Notas de Débito (E33) y Notas de Crédito (E34) ─────────────

  @Post('nota-debito/:id/emitir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF E33 (Nota de Débito) para una nota ya creada en el sistema',
    description: 'Genera y envía a MSeller el comprobante fiscal electrónico E33. ' +
      'La nota debe estar en estado EMITIDA. Si la nota tiene factura original, ' +
      'se resuelve automáticamente el e-NCF referenciado.',
  })
  async emitirEcfNotaDebito(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirEcfNotaDebitoDto,
    @GetUser() usuario: User,
  ) {
    const empresaId = (usuario as any).empresaId ?? 0;

    const infoReferencia: import('./services/ecf-builder.service').MSellerInfoReferencia | undefined =
      dto.ncfModificado
        ? {
            NCFModificado:      dto.ncfModificado,
            FechaNCFModificado: dto.fechaNcfModificado ?? '',
            CodigoModificacion: '3',   // E33: siempre "3" (corrección de montos)
          }
        : undefined;

    return this.emitirUseCase.execute({
      empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.NOTA_DEBITO,
      documentoOrigenId:   id,
      tipoEcf:             33,
      infoReferencia,
    });
  }

  @Post('nota-credito/:id/emitir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF E34 (Nota de Crédito) para una nota ya creada en el sistema',
    description:
      'CodigoModificacion (STRING): ' +
      '"1"=Anulación total, "2"=Corrección de texto, "3"=Corrección de montos, ' +
      '"4"=Reemplazo de contingencia, "5"=Referencia a Factura de Consumo.',
  })
  async emitirEcfNotaCredito(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirEcfNotaCreditoDto,
    @GetUser() usuario: User,
  ) {
    const empresaId = (usuario as any).empresaId ?? 0;

    const infoReferencia: import('./services/ecf-builder.service').MSellerInfoReferencia | undefined =
      dto.ncfModificado
        ? {
            NCFModificado:      dto.ncfModificado,
            FechaNCFModificado: dto.fechaNcfModificado ?? '',
            CodigoModificacion: dto.codigoModificacion,   // ya es string desde el DTO
          }
        : { CodigoModificacion: dto.codigoModificacion } as any;

    return this.emitirUseCase.execute({
      empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.NOTA_CREDITO,
      documentoOrigenId:   id,
      tipoEcf:             34,
      infoReferencia,
    });
  }

  // ── E41: Comprobante de Compras ────────────────────────────────────────────

  @Post('compra/:id/emitir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF E41 (Comprobante de Compras) para una compra ya registrada',
    description: 'Genera e-CF E41. La compra debe tener proveedor con RNC.',
  })
  async emitirEcfCompra(
    @Param('id', ParseIntPipe) id: number,
    @Body() _dto: EmitirEcfCompraDto,
    @GetUser() usuario: User,
  ) {
    const empresaId = (usuario as any).empresaId ?? 0;
    return this.emitirUseCase.execute({
      empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.COMPRA,
      documentoOrigenId:   id,
      tipoEcf:             41,
    });
  }

  // ── E43: Gastos Menores ────────────────────────────────────────────────────

  @Post('gasto/:id/emitir')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF E43 (Gastos Menores) para un gasto ya registrado',
    description: 'Genera e-CF E43. No requiere RNC del proveedor. Todo el monto va como exento.',
  })
  async emitirEcfGasto(
    @Param('id', ParseIntPipe) id: number,
    @Body() _dto: EmitirEcfGastoDto,
    @GetUser() usuario: User,
  ) {
    const empresaId = (usuario as any).empresaId ?? 0;
    return this.emitirUseCase.execute({
      empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.GASTO,
      documentoOrigenId:   id,
      tipoEcf:             43,
    });
  }

  // ── E47: Pagos al Exterior ─────────────────────────────────────────────────

  @Post('compra/:id/emitir-pago-exterior')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Emitir e-CF E47 (Pago al Exterior) para una compra a proveedor extranjero',
    description: 'Genera e-CF E47 con retención ISR (27% por defecto). Requiere datos de moneda extranjera.',
  })
  async emitirEcfPagoExterior(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmitirEcfPagoExteriorDto,
    @GetUser() usuario: User,
  ) {
    const empresaId = (usuario as any).empresaId ?? 0;
    return this.emitirUseCase.execute({
      empresaId,
      documentoOrigenTipo: DocumentoOrigenTipo.COMPRA,
      documentoOrigenId:   id,
      tipoEcf:             47,
      otraMoneda: dto.otraMoneda as any,
      retencionISR: dto.retencionISR ?? 27,
    });
  }

  @Get(':numero')
  @ApiOperation({ summary: 'Obtener e-CF completo por número (ej: E310000000001)' })
  getECFByNumero(@Param('numero') numero: string) {
    return this.ecfService.getECFByNumero(numero);
  }

  @Get(':numero/xml')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Descargar XML del e-CF' })
  async getXML(@Param('numero') numero: string, @Res() res: Response) {
    const xml = await this.ecfService.getXML(numero);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${numero}.xml"`);
    res.send(xml);
  }

  @Patch(':numero/estado')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar estado DGII manualmente (solo ADMIN)' })
  actualizarEstado(
    @Param('numero') numero: string,
    @Body() dto: UpdateEstadoECFDto,
  ) {
    return this.ecfService.actualizarEstadoDGII(numero, dto);
  }

  @Post(':numero/reenviar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Reintentar envío a MSeller para un e-CF pendiente o rechazado' })
  reenviar(@Param('numero') numero: string) {
    return this.ecfService.reintentarEnvio(numero);
  }

  @Post('ejecutar-reintentos')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ejecutar inmediatamente el job de reintentos MSeller (PENDIENTE_ENVIO)' })
  async ejecutarReintentos() {
    await this.reintentoJob.run();
    return { message: 'Job de reintentos ejecutado. Revisa el estado de los e-CFs en /ecf/pendientes.' };
  }

  // ── Proveedor e-CF ─────────────────────────────────────────────────

  @Get('config/proveedor')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener configuración del proveedor e-CF activo' })
  getProveedor() {
    return this.ecfService.getProveedor();
  }

  @Post('config/proveedor')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Configurar proveedor e-CF (solo ADMIN, reemplaza el activo)' })
  createProveedor(@Body() dto: CreateProveedorECFDto) {
    return this.ecfService.createProveedor(dto);
  }

  @Patch('config/proveedor/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar proveedor e-CF' })
  updateProveedor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorECFDto,
  ) {
    return this.ecfService.updateProveedor(id, dto);
  }
}
