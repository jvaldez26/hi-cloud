import { PlanGuard } from '../suscripciones/guards/plan.guard';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { ContabilidadService } from './services/contabilidad.service';
import { ImportacionCuentasService } from './services/importacion-cuentas.service';
import { CreateCuentaContableDto } from './dto/create-cuenta-contable.dto';
import { UpdateCuentaContableDto } from './dto/update-cuenta-contable.dto';
import { CreateAsientoDto } from './dto/create-asiento.dto';
import { FiltroContabilidadDto } from './dto/filtro-contabilidad.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

@ApiTags('Contabilidad General')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseGuards(PlanGuard)
@RequiereModulo('contabilidad')
@Controller('contabilidad')
export class ContabilidadController {
  constructor(
    private contabilidadService: ContabilidadService,
    private importacionCuentasService: ImportacionCuentasService,
  ) {}

  // ── Importación de Plan de Cuentas por plantilla ─────────────────────────

  private static readonly EXCEL_O_CSV_FILTER = (_: any, file: { mimetype: string; originalname: string }, cb: any) => {
    const MIME_PERMITIDOS = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', 'text/csv', 'text/plain',
      'text/comma-separated-values', 'application/csv', 'application/octet-stream',
    ];
    const nombre = file.originalname?.toLowerCase() ?? '';
    const esValido = MIME_PERMITIDOS.includes(file.mimetype) || nombre.endsWith('.xlsx') || nombre.endsWith('.csv');
    if (!esValido) return cb(new BadRequestException('Solo se permiten archivos .xlsx o .csv'), false);
    cb(null, true);
  };

  @Get('cuentas/plantilla-importacion')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Descargar la plantilla .xlsx para importar el Plan de Cuentas (hojas Cuentas + Instrucciones)' })
  descargarPlantillaCuentas(@Res() res: Response) {
    const buffer = this.importacionCuentasService.getPlantilla();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-plan-de-cuentas.xlsx"');
    res.send(buffer);
  }

  @Post('cuentas/importar/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: ContabilidadController.EXCEL_O_CSV_FILTER,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Vista previa de la importación del Plan de Cuentas — no escribe nada' })
  previsualizarImportacionCuentas(@UploadedFile() file: { buffer: Buffer; originalname: string }) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.importacionCuentasService.previsualizar(file.buffer);
  }

  @Post('cuentas/importar/ejecutar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: ContabilidadController.EXCEL_O_CSV_FILTER,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ejecuta la importación del Plan de Cuentas (mismo archivo ya confirmado en la vista previa) — transacción única' })
  ejecutarImportacionCuentas(@UploadedFile() file: { buffer: Buffer; originalname: string }, @GetUser() usuario: User) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    const nombre = (usuario as any).nombre ?? (usuario as any).name ?? `Usuario #${usuario.id}`;
    return this.importacionCuentasService.ejecutar(file.buffer, { id: usuario.id, nombre });
  }

  // ── "Completar con el catálogo estándar" — mismo motor, sin subir archivo ──

  @Get('cuentas/estandar/preview')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Vista previa de "Completar con el catálogo estándar" — solo cuentas a crear, nunca actualiza una existente' })
  previsualizarEstandar() {
    return this.importacionCuentasService.previsualizarEstandar();
  }

  @Post('cuentas/estandar/completar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Ejecuta "Completar con el catálogo estándar" — agrega las cuentas del estándar que le falten a la empresa' })
  completarEstandar(@GetUser() usuario: User) {
    const nombre = (usuario as any).nombre ?? (usuario as any).name ?? `Usuario #${usuario.id}`;
    return this.importacionCuentasService.completarEstandar({ id: usuario.id, nombre });
  }

  // ── Plan de Cuentas ────────────────────────────────────────────────────────

  @Get('cuentas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Plan de Cuentas — filtrable por clasificación/estado/búsqueda, con conteos por chip' })
  @ApiQuery({ name: 'soloMovimientos', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'clasificacion', required: false, enum: ['todas', 'activos', 'pasivos', 'capital', 'ingresos', 'costos', 'gastos'] })
  @ApiQuery({ name: 'estado', required: false, enum: ['todas', 'activas', 'inactivas', 'grupo'] })
  getCuentas(
    @Query('soloMovimientos') soloMovimientos?: string,
    @Query('search') search?: string,
    @Query('clasificacion') clasificacion?: string,
    @Query('estado') estado?: string,
  ) {
    return this.contabilidadService.getCuentas({
      soloMovimientos: soloMovimientos === 'true', search, clasificacion, estado,
    });
  }

  @Post('cuentas')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear nueva cuenta contable' })
  createCuenta(@Body() dto: CreateCuentaContableDto) {
    return this.contabilidadService.createCuenta(dto);
  }

  @Get('cuentas/sin-etiquetar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({
    summary: 'Cuentas de movimiento sin etiqueta fiscal completa (606/IR-2) — lista de trabajo del contador',
    description:
      'Declarada ANTES de cuentas/:id a propósito — si no, Nest intentaría ' +
      'parsear "sin-etiquetar" como un id numérico. Incluye tanto cuentas ' +
      'custom que nunca se etiquetaron como las del seed que la Fase 2 dejó ' +
      'sin dictamen a propósito (ver contabilidad.service.ts).',
  })
  getCuentasSinEtiquetar() {
    return this.contabilidadService.getCuentasSinEtiquetar();
  }

  @Get('cuentas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Obtener cuenta contable por ID' })
  findCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.findCuentaById(id);
  }

  @Patch('cuentas/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Actualizar cuenta contable' })
  updateCuenta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuentaContableDto,
  ) {
    return this.contabilidadService.updateCuenta(id, dto);
  }

  @Delete('cuentas/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar cuenta contable (solo sin movimientos)' })
  removeCuenta(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.removeCuenta(id);
  }

  // ── Asientos Contables ─────────────────────────────────────────────────────

  @Post('asientos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear asiento manual (validación de cuadre automática)' })
  createAsiento(@Body() dto: CreateAsientoDto, @GetUser() usuario: User) {
    return this.contabilidadService.createAsiento(dto, usuario.id);
  }

  @Get('asientos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar asientos con filtros (fecha, tipo, estado)' })
  getAsientos(@Query() filtro: FiltroContabilidadDto) {
    return this.contabilidadService.getAsientos(filtro);
  }

  @Get('asientos/:id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de asiento con todas sus líneas' })
  findAsiento(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.findAsientoById(id);
  }

  @Patch('asientos/:id/contabilizar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Contabilizar asiento en borrador (lo hace definitivo)' })
  contabilizar(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.contabilizar(id);
  }

  @Patch('asientos/:id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular asiento contable (solo ADMIN)' })
  anularAsiento(@Param('id', ParseIntPipe) id: number) {
    return this.contabilidadService.anularAsiento(id);
  }

  // ── Libro Diario ───────────────────────────────────────────────────────────

  @Get('libro-diario')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Libro Diario — asientos contabilizados ordenados por fecha' })
  getLibroDiario(@Query() filtro: FiltroContabilidadDto) {
    return this.contabilidadService.getLibroDiario(filtro);
  }

  // ── Libro Mayor ────────────────────────────────────────────────────────────

  @Get('libro-mayor/:cuentaId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Libro Mayor de una cuenta — movimientos con saldo acumulado' })
  @ApiQuery({ name: 'fechaDesde', required: false })
  @ApiQuery({ name: 'fechaHasta', required: false })
  getLibroMayor(
    @Param('cuentaId', ParseIntPipe) cuentaId: number,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    return this.contabilidadService.getLibroMayor(cuentaId, fechaDesde, fechaHasta);
  }

  // getBalanceComprobacion/getBalanceGeneral/getEstadoResultados —
  // eliminados (P3 Bloque 5). Ver el comentario en contabilidad.service.ts:
  // ningún frontend los llamaba, y reportes-financieros.controller.ts ya
  // expone las rutas reales (/balance-comprobacion, /balance-general,
  // /estado-resultados) que BalanceComprobacionPage.tsx/
  // ReportesFinancierosPage.tsx sí consumen.
}
