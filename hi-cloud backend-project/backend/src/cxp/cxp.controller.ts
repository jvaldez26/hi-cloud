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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CxPService } from './cxp.service';
import { RegistrarPagoRealizadoDto } from './dto/registrar-pago-realizado.dto';
import { FiltroCuentasDto } from '../common/dto/filtro-cuentas.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';

@ApiTags('Cuentas por Pagar (CxP)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cxp')
export class CxPController {
  constructor(private cxpService: CxPService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Listar cuentas por pagar con filtros (?estado=&fechaDesde=&fechaHasta=)' })
  getCuentas(@Query() filtro: FiltroCuentasDto) {
    return this.cxpService.getCuentas(filtro);
  }

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Resumen: total por pagar, vencido, por vencer, pagado del mes' })
  getResumen() {
    return this.cxpService.getResumenPagos();
  }

  @Get('vencidas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Cuentas vencidas que requieren atención inmediata' })
  getVencidas() {
    return this.cxpService.getCuentasVencidas();
  }

  @Get('proveedor/:proveedorId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Todas las cuentas por pagar de un proveedor específico' })
  getCuentasPorProveedor(
    @Param('proveedorId', ParseIntPipe) proveedorId: number,
    @Query() filtro: FiltroCuentasDto,
  ) {
    return this.cxpService.getCuentasPorProveedor(proveedorId, filtro);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Detalle de una cuenta por pagar' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.cxpService.findById(id);
  }

  @Get(':id/pagos')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Historial de pagos realizados a una cuenta' })
  getPagos(@Param('id', ParseIntPipe) id: number) {
    return this.cxpService.getPagos(id);
  }

  @Post(':id/pago')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Registrar un pago (parcial o total) a un proveedor' })
  registrarPago(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarPagoRealizadoDto,
    @GetUser() usuario: User,
  ) {
    return this.cxpService.registrarPago(id, dto, usuario.id);
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular cuenta por pagar (solo ADMIN)' })
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.cxpService.anular(id);
  }
}
