import {
  Controller, Get, Post, Patch, Put, Delete, Body,
  Param, Query, ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FacturasRecurrentesService } from './facturas-recurrentes.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { CreateRecurrenteDto, UpdateRecurrenteDto } from './dto/factura-recurrente.dto';

@ApiTags('Facturas Recurrentes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('facturas-recurrentes')
export class FacturasRecurrentesController {
  constructor(private svc: FacturasRecurrentesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear factura recurrente (auto-facturación)' })
  crear(@Body() dto: CreateRecurrenteDto, @GetUser() usuario: User) {
    return this.svc.crear(dto, usuario);
  }

  @Get()
  @ApiOperation({ summary: 'Listar facturas recurrentes' })
  listar(@Query() pagination: PaginationDto & { activa?: string; modoEmision?: string }) {
    return this.svc.listar(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una factura recurrente' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar la plantilla recurrente' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecurrenteDto) {
    return this.svc.actualizar(id, dto);
  }

  @Get(':id/historial')
  @ApiOperation({ summary: 'Historial de facturas generadas por esta plantilla' })
  historial(@Param('id', ParseIntPipe) id: number, @Query() pagination: PaginationDto) {
    return this.svc.historialRecurrente(id, pagination);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Activar o pausar la factura recurrente' })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleActiva(id);
  }

  @Post(':id/ejecutar-ahora')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar la factura ahora (sin esperar al cron)' })
  ejecutarAhora(@Param('id', ParseIntPipe) id: number) {
    return this.svc.ejecutarAhora(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar factura recurrente' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
