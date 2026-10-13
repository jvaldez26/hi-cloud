import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { ModuloAddonGuard } from '../../modulos-addon/guards/modulo-addon.guard';
import { TenantService } from '../../tenant/tenant.service';
import { FeriadosService } from './feriados.service';
import { CrearFeriadoDto, ActualizarFeriadoDto } from '../dto/prestamista-motor.dto';

@Controller('prestamista/feriados')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, ModuloAddonGuard('prestamista'))
@ApiTags('Prestamista - Feriados')
@ApiBearerAuth()
export class FeriadosController {
  constructor(private readonly svc: FeriadosService, private readonly tenantSvc: TenantService) {}
  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  listarAnio(@Query('anio', ParseIntPipe) anio: number) {
    return this.svc.listarAnio(this.empresaId, anio);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  crear(@Body() body: CrearFeriadoDto) {
    return this.svc.crear(this.empresaId, body);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() body: ActualizarFeriadoDto) {
    return this.svc.actualizar(this.empresaId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(this.empresaId, id);
  }
}
