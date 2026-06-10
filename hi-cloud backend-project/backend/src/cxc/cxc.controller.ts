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
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CxCService } from './cxc.service';
import { RegistrarPagoCobradoDto } from './dto/registrar-pago-cobrado.dto';
import { FiltroCuentasDto } from '../common/dto/filtro-cuentas.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Cuentas por Cobrar (CxC)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cxc')
export class CxCController {
  constructor(private cxcService: CxCService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar cuentas por cobrar con filtros (?estado=&fechaDesde=&fechaHasta=)' })
  getCuentas(@Query() filtro: FiltroCuentasDto) {
    return this.cxcService.getCuentas(filtro);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Resumen: total por cobrar, vencido, por vencer, cobrado del mes' })
  getResumen() {
    return this.cxcService.getResumenCobros();
  }

  @Get('vencidas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cuentas con fecha de vencimiento superada y aún pendientes' })
  getVencidas() {
    return this.cxcService.getCuentasVencidas();
  }

  @Get('cliente/:clienteId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Todas las cuentas por cobrar de un cliente específico' })
  getCuentasPorCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Query() filtro: FiltroCuentasDto,
  ) {
    return this.cxcService.getCuentasPorCliente(clienteId, filtro);
  }

  @Get('aging')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Antigüedad de saldos agrupada por cliente' })
  getAging() {
    return this.cxcService.getAging();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Detalle de una cuenta por cobrar' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.cxcService.findById(id);
  }

  @Get(':id/pagos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Historial de cobros de una cuenta' })
  getPagos(@Param('id', ParseIntPipe) id: number) {
    return this.cxcService.getPagos(id);
  }

  @Get('pagos/:pagoId/pdf')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Generar recibo PDF de un cobro registrado' })
  async getPagoPDF(
    @Param('pagoId', ParseIntPipe) pagoId: number,
    @Res() res: Response,
  ) {
    const pdf = await this.cxcService.generarPDFdePago(pagoId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-pago-${pagoId}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.end(pdf);
  }

  @Post(':id/pago')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar un cobro (parcial o total) a una cuenta por cobrar' })
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoCobradoDto,
    @GetUser() usuario: User,
  ) {
    return this.cxcService.registrarPago(id, dto, usuario.id);
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular cuenta por cobrar (solo ADMIN, no aplica a cuentas pagadas)' })
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.cxcService.anular(id);
  }
}
